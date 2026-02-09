import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import {
  Target,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  AlertTriangle,
  Search,
  ArrowRight,
  BarChart3,
  Lock,
  GitBranch,
  Shield,
  Sparkles,
  CheckCircle,
  XCircle,
  Activity,
  Users,
  Zap,
  Gauge,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  CircleDot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { usePermission, PermissionGate } from "@/components/role-provider";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition, Invoice, Agent } from "@shared/schema";

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />;
  if (trend === "down") return <TrendingDown className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
}

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 0.9
    ? "bg-emerald-500 dark:bg-emerald-400"
    : value >= 0.7
    ? "bg-amber-500 dark:bg-amber-400"
    : "bg-red-500 dark:bg-red-400";
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] text-muted-foreground">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function SlaTrafficLight({ outcome, kpis, agents }: { outcome: OutcomeContract; kpis: KpiDefinition[]; agents: Agent[] }) {
  const sla = (outcome.slaConfig || {}) as Record<string, number>;
  const outcomeKpis = kpis.filter((k) => k.outcomeId === outcome.id);
  const boundAgents = agents.filter((a) => a.outcomeId === outcome.id);

  const checks: Array<{ label: string; status: "green" | "yellow" | "red" }> = [];

  if (sla.minSuccessRate) {
    const avgSuccess = boundAgents.length > 0
      ? boundAgents.reduce((sum, a) => sum + (a.successRate || 0), 0) / boundAgents.length
      : outcomeKpis.length > 0
      ? outcomeKpis.reduce((sum, k) => sum + (k.target > 0 ? (k.currentValue || 0) / k.target : 0), 0) / outcomeKpis.length
      : 0;
    checks.push({
      label: "Success Rate",
      status: avgSuccess >= sla.minSuccessRate ? "green" : avgSuccess >= sla.minSuccessRate * 0.95 ? "yellow" : "red",
    });
  }
  if (sla.uptimePercent) {
    const avgHealth = boundAgents.length > 0
      ? boundAgents.reduce((sum, a) => sum + (a.healthScore || 0), 0) / boundAgents.length
      : 99;
    const derivedUptime = Math.min(100, avgHealth * 1.1);
    checks.push({
      label: "Uptime",
      status: derivedUptime >= sla.uptimePercent ? "green" : derivedUptime >= sla.uptimePercent * 0.995 ? "yellow" : "red",
    });
  }
  if (sla.maxP95LatencyMs) {
    const avgLatency = boundAgents.length > 0
      ? boundAgents.reduce((sum, a) => sum + (a.avgLatencyMs || 0), 0) / boundAgents.length
      : 0;
    checks.push({
      label: "P95 Latency",
      status: avgLatency <= sla.maxP95LatencyMs ? "green" : avgLatency <= sla.maxP95LatencyMs * 1.2 ? "yellow" : "red",
    });
  }
  if (sla.maxPolicyViolationRate !== undefined) {
    checks.push({
      label: "Policy Compliance",
      status: "green",
    });
  }

  if (checks.length === 0) return null;

  const worst = checks.some((c) => c.status === "red") ? "red" : checks.some((c) => c.status === "yellow") ? "yellow" : "green";
  const colors = {
    green: "bg-emerald-500 dark:bg-emerald-400",
    yellow: "bg-amber-500 dark:bg-amber-400",
    red: "bg-red-500 dark:bg-red-400",
  };

  return (
    <div className="flex items-center gap-1.5" data-testid={`sla-status-${outcome.id}`}>
      <div className={`w-2.5 h-2.5 rounded-full ${colors[worst]}`} />
      <span className="text-[11px] text-muted-foreground">SLA</span>
      <div className="flex items-center gap-0.5 ml-1">
        {checks.map((c, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full ${colors[c.status]}`} title={`${c.label}: ${c.status}`} />
        ))}
      </div>
    </div>
  );
}

export default function Outcomes() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [simulateOpen, setSimulateOpen] = useState(false);
  const [expandedKpis, setExpandedKpis] = useState(true);
  const { toast } = useToast();
  const outcomesPerm = usePermission("create_modify_outcomes");

  const { data: outcomes, isLoading } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/kpis"],
  });
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: agents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: driftSignals } = useQuery<Array<{ id: string; agentId: string; agentName: string; metric: string; driftPercent: number; severity: string }>>({
    queryKey: ["/api/drift-signals"],
  });
  const { data: backendRiskDrivers } = useQuery<Array<{ type: string; label: string; severity: string; detail: string }>>({
    queryKey: ["/api/outcome-risk-drivers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; riskTier: string; pricingModel: string; pricePerUnit: number }) => {
      const res = await apiRequest("POST", "/api/outcomes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setCreateOpen(false);
      toast({ title: "Outcome contract created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create outcome", description: err.message, variant: "destructive" });
    },
  });

  const filtered = outcomes?.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  const billedRevenue = invoices?.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const pendingRevenue = invoices?.filter((i) => i.status === "pending").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const disputedRevenue = invoices?.filter((i) => i.status === "disputed").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const totalRevenue = billedRevenue + pendingRevenue + disputedRevenue;
  const activeContracts = outcomes?.filter((o) => o.status === "active")?.length || 0;

  const allKpiStats = (kpis || []).map((k) => {
    const attainment = k.target > 0 ? ((k.currentValue || 0) / k.target) * 100 : 0;
    return { ...k, attainment };
  });
  const overallAttainment = allKpiStats.length > 0
    ? allKpiStats.reduce((s, k) => s + k.attainment, 0) / allKpiStats.length
    : 0;
  const atRiskKpis = allKpiStats.filter((k) => k.attainment < 80);
  const onTrackKpis = allKpiStats.filter((k) => k.attainment >= 80 && k.attainment < 100);
  const exceededKpis = allKpiStats.filter((k) => k.attainment >= 100);

  const riskDrivers: Array<{ type: string; label: string; severity: "critical" | "high" | "medium" | "low"; detail: string }> = [];
  if (driftSignals) {
    driftSignals
      .filter((d) => d.severity === "critical" || d.severity === "high")
      .slice(0, 3)
      .forEach((d) => {
        riskDrivers.push({
          type: "drift",
          label: `${d.agentName} drift`,
          severity: d.severity as "critical" | "high",
          detail: `${d.metric} drifted ${Math.abs(d.driftPercent).toFixed(1)}%`,
        });
      });
  }
  if (backendRiskDrivers) {
    backendRiskDrivers.forEach((d) => {
      riskDrivers.push({
        type: d.type,
        label: d.label,
        severity: d.severity as "critical" | "high" | "medium" | "low",
        detail: d.detail,
      });
    });
  }
  if (atRiskKpis.length > 0) {
    riskDrivers.push({
      type: "kpi",
      label: `${atRiskKpis.length} KPI(s) at risk`,
      severity: atRiskKpis.some((k) => k.attainment < 50) ? "critical" : "high",
      detail: atRiskKpis.map((k) => k.name).slice(0, 3).join(", "),
    });
  }
  if (disputedRevenue > 0) {
    riskDrivers.push({
      type: "billing",
      label: "Revenue disputed",
      severity: "medium",
      detail: `$${disputedRevenue.toLocaleString()} in dispute`,
    });
  }
  riskDrivers.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  const getAgentsForOutcome = (outcomeId: string) => {
    return (agents || []).filter((a) => a.outcomeId === outcomeId);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-outcomes">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Outcomes Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Are promised outcomes being delivered?
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Dialog open={simulateOpen} onOpenChange={setSimulateOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-simulate-change">
                <SlidersHorizontal className="w-4 h-4 mr-1.5" /> Simulate Change
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Scenario Planner</DialogTitle>
              </DialogHeader>
              <ScenarioPlanner outcomes={outcomes || []} kpis={kpis || []} agents={agents || []} onClose={() => setSimulateOpen(false)} />
            </DialogContent>
          </Dialog>
          <Link href="/outcomes/discover">
            <Button variant="outline" data-testid="button-discover-outcomes">
              <Sparkles className="w-4 h-4 mr-1.5" /> Discover with AI
            </Button>
          </Link>
          {!outcomesPerm.allowed ? (
            <Button disabled title="You do not have permission to create outcome contracts" data-testid="button-create-outcome">
              <Plus className="w-4 h-4 mr-1.5" /> New Contract
            </Button>
          ) : (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-outcome">
                  <Plus className="w-4 h-4 mr-1.5" /> New Contract
                  {outcomesPerm.permission.access === "conditional" && outcomesPerm.permission.annotation && (
                    <Badge variant="secondary" className="text-[10px] ml-1">{outcomesPerm.permission.annotation}</Badge>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Outcome Contract</DialogTitle>
                </DialogHeader>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    createMutation.mutate({
                      name: fd.get("name") as string,
                      description: fd.get("description") as string,
                      riskTier: fd.get("riskTier") as string,
                      pricingModel: fd.get("pricingModel") as string,
                      pricePerUnit: parseFloat(fd.get("pricePerUnit") as string) || 0,
                    });
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="name">Contract Name</Label>
                    <Input id="name" name="name" required placeholder="e.g., Reduce Support Load" data-testid="input-outcome-name" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" placeholder="Describe the business outcome..." data-testid="input-outcome-description" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Risk Tier</Label>
                      <select name="riskTier" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="MEDIUM">
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Pricing Model</Label>
                      <select name="pricingModel" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" defaultValue="PER_OUTCOME_EVENT">
                        <option value="PER_OUTCOME_EVENT">Per Outcome Event</option>
                        <option value="FIXED_MONTHLY">Fixed Monthly</option>
                        <option value="TIERED">Tiered</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="pricePerUnit">Price per Unit ($)</Label>
                    <Input id="pricePerUnit" name="pricePerUnit" type="number" step="0.01" placeholder="2.50" data-testid="input-outcome-price" />
                  </div>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-outcome">
                    {createMutation.isPending ? "Creating..." : "Create Contract"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* === KPI TILES + REVENUE STRIP === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="section-kpi-tiles">
        <Card data-testid="stat-overall-attainment">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Overall KPI Attainment</span>
                <span className="text-2xl font-semibold tracking-tight">{overallAttainment.toFixed(1)}%</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-exceeded">{exceededKpis.length} exceeded</Badge>
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-on-track">{onTrackKpis.length} on track</Badge>
                  {atRiskKpis.length > 0 && (
                    <Badge variant="destructive" className="text-[10px]" data-testid="badge-at-risk">{atRiskKpis.length} at risk</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                <Target className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-active-contracts">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Active Contracts</span>
                <span className="text-2xl font-semibold tracking-tight">{activeContracts}</span>
                <span className="text-xs text-muted-foreground">{outcomes?.length || 0} total</span>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                <Activity className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-revenue-breakdown">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Outcome Revenue</span>
                <span className="text-2xl font-semibold tracking-tight">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                    <span className="text-[10px] text-muted-foreground">${billedRevenue.toLocaleString()} billed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                    <span className="text-[10px] text-muted-foreground">${pendingRevenue.toLocaleString()} pending</span>
                  </div>
                  {disputedRevenue > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
                      <span className="text-[10px] text-muted-foreground">${disputedRevenue.toLocaleString()} disputed</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-emerald-500/10 shrink-0">
                <DollarSign className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-agents-contributing">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Agents Contributing</span>
                <span className="text-2xl font-semibold tracking-tight">
                  {(agents || []).filter((a) => a.outcomeId).length}
                </span>
                <span className="text-xs text-muted-foreground">{agents?.length || 0} total agents</span>
              </div>
              <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
                <Users className="w-4 h-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === KPI DETAIL TILES (expandable) === */}
      <Card data-testid="section-kpi-detail">
        <CardContent className="p-4">
          <button
            onClick={() => setExpandedKpis(!expandedKpis)}
            className="flex items-center justify-between w-full gap-2"
            data-testid="button-toggle-kpi-detail"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">KPI Performance</span>
              <Badge variant="outline" className="text-[10px]">{kpis?.length || 0} KPIs</Badge>
            </div>
            {expandedKpis ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {expandedKpis && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
              {allKpiStats.map((kpi) => {
                const outcomeName = outcomes?.find((o) => o.id === kpi.outcomeId)?.name || "";
                const atRisk = kpi.attainment < 80;
                const exceeded = kpi.attainment >= 100;
                return (
                  <Link key={kpi.id} href={`/outcomes/${kpi.outcomeId}`}>
                    <div
                      className="flex flex-col gap-2 p-3 rounded-md border hover-elevate cursor-pointer"
                      data-testid={`kpi-tile-${kpi.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{kpi.name}</span>
                        <TrendIcon trend={kpi.trend || "stable"} />
                      </div>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-lg font-semibold">
                          {typeof kpi.currentValue === "number" && kpi.currentValue % 1 !== 0
                            ? kpi.currentValue.toFixed(1)
                            : kpi.currentValue || 0}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          / {kpi.target} {kpi.unit}
                        </span>
                      </div>
                      <Progress
                        value={Math.min(100, kpi.attainment)}
                        className={`h-1.5 ${atRisk ? "[&>div]:bg-red-500" : exceeded ? "[&>div]:bg-emerald-500" : ""}`}
                      />
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground truncate">{outcomeName}</span>
                        <ConfidenceDot value={kpi.confidence || 0} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === SLA STATUS + RISK DRIVERS (side-by-side) === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SLA Status Overview */}
        <Card data-testid="section-sla-status">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">SLA Status</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-col gap-2">
              {outcomes?.map((outcome) => {
                const sla = (outcome.slaConfig || {}) as Record<string, number>;
                const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcome.id) || [];
                const avgAttainment = outcomeKpis.length > 0
                  ? outcomeKpis.reduce((s, k) => s + (k.target > 0 ? ((k.currentValue || 0) / k.target) * 100 : 0), 0) / outcomeKpis.length
                  : 0;
                const slaTarget = sla.minSuccessRate ? sla.minSuccessRate * 100 : 90;
                const slaStatus = avgAttainment >= slaTarget ? "green" : avgAttainment >= slaTarget * 0.95 ? "yellow" : "red";
                const statusColors = {
                  green: "bg-emerald-500 dark:bg-emerald-400",
                  yellow: "bg-amber-500 dark:bg-amber-400",
                  red: "bg-red-500 dark:bg-red-400",
                };
                return (
                  <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
                    <div className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer" data-testid={`sla-row-${outcome.id}`}>
                      <div className={`w-3 h-3 rounded-full shrink-0 ${statusColors[slaStatus]}`} />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium truncate">{outcome.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {avgAttainment.toFixed(1)}% attainment
                          {sla.minSuccessRate ? ` (SLA: ${(sla.minSuccessRate * 100).toFixed(0)}%)` : ""}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {outcomeKpis.length} KPIs
                      </Badge>
                    </div>
                  </Link>
                );
              })}
              {(!outcomes || outcomes.length === 0) && (
                <span className="text-xs text-muted-foreground py-4 text-center">No contracts yet</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Risk Drivers */}
        <Card data-testid="section-risk-drivers">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Top Risk Drivers</CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-col gap-2">
              {riskDrivers.length > 0 ? (
                riskDrivers.map((risk, i) => {
                  const severityColors = {
                    critical: "text-red-600 dark:text-red-400 bg-red-500/10",
                    high: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
                    medium: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
                    low: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
                  };
                  const RiskIcon = risk.type === "drift" ? Activity : risk.type === "tool_failure" ? Zap : risk.type === "policy_violation" ? Shield : risk.type === "kpi" ? AlertTriangle : DollarSign;
                  return (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-md" data-testid={`risk-driver-${i}`}>
                      <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${severityColors[risk.severity]}`}>
                        <RiskIcon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-xs font-medium">{risk.label}</span>
                        <span className="text-[10px] text-muted-foreground">{risk.detail}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{risk.severity}</Badge>
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <CheckCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span className="text-xs text-muted-foreground">No critical risks detected</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === AGENTS CONTRIBUTING === */}
      <Card data-testid="section-agents-contributing">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Agents Contributing to KPIs</CardTitle>
          <Users className="w-4 h-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-col gap-3">
            {outcomes?.map((outcome) => {
              const boundAgents = getAgentsForOutcome(outcome.id);
              const attribution = (outcome.attributionRules || {}) as Record<string, unknown>;
              const agentWeights = (attribution.agentWeights || {}) as Record<string, number>;
              const model = (attribution.model || "equal") as string;
              if (boundAgents.length === 0) return null;
              return (
                <div key={outcome.id} className="flex flex-col gap-2" data-testid={`attribution-${outcome.id}`}>
                  <div className="flex items-center gap-2">
                    <CircleDot className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium">{outcome.name}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{model.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pl-5">
                    {boundAgents.map((agent) => {
                      const weight = agentWeights[agent.id] || (model === "equal" ? Math.round(100 / boundAgents.length) : 0);
                      return (
                        <Link key={agent.id} href={`/agents/${agent.id}`}>
                          <div className="flex items-center gap-2 p-2 rounded-md border hover-elevate cursor-pointer" data-testid={`agent-attribution-${agent.id}`}>
                            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 shrink-0">
                              <Zap className="w-3 h-3 text-primary" />
                            </div>
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="text-xs font-medium truncate">{agent.name}</span>
                              <span className="text-[10px] text-muted-foreground">{agent.environment || "staging"}</span>
                            </div>
                            <span className="text-xs font-semibold text-primary shrink-0">{weight}%</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(agents || []).filter((a) => a.outcomeId).length === 0 && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <Users className="w-4 h-4 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">No agents bound to outcomes yet</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === OUTCOME CONTRACTS LIST === */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search contracts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-outcomes"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((outcome) => {
          const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcome.id) || [];
          const avgProgress = outcomeKpis.length
            ? outcomeKpis.reduce((sum, k) => sum + (k.target ? ((k.currentValue || 0) / k.target) * 100 : 0), 0) / outcomeKpis.length
            : 0;
          const boundAgents = getAgentsForOutcome(outcome.id);
          const sla = (outcome.slaConfig || {}) as Record<string, number>;
          return (
            <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-outcome-${outcome.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                        <Target className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold truncate">{outcome.name}</span>
                        <span className="text-[11px] text-muted-foreground">v{outcome.version}</span>
                      </div>
                    </div>
                    <StatusBadge status={outcome.riskTier} />
                  </div>
                  {outcome.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{outcome.description}</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Overall Progress</span>
                      <span className="text-xs font-medium">{Math.round(avgProgress)}%</span>
                    </div>
                    <Progress value={avgProgress} className="h-1.5" />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap pt-1 border-t">
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">{outcomeKpis.length} KPIs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        {outcome.currency || "$"}{outcome.pricePerUnit}/unit
                      </span>
                    </div>
                    <SlaTrafficLight outcome={outcome} kpis={kpis || []} agents={agents || []} />
                    {boundAgents.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">{boundAgents.length} agents</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={outcome.status} />
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {filtered?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Target className="w-10 h-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No outcome contracts found</p>
        </div>
      )}
    </div>
  );
}

function ScenarioPlanner({
  outcomes,
  kpis,
  agents,
  onClose,
}: {
  outcomes: OutcomeContract[];
  kpis: KpiDefinition[];
  agents: Agent[];
  onClose: () => void;
}) {
  const [changeType, setChangeType] = useState("model_upgrade");
  const [selectedOutcome, setSelectedOutcome] = useState(outcomes[0]?.id || "");
  const [simulated, setSimulated] = useState(false);

  const outcomeKpis = kpis.filter((k) => k.outcomeId === selectedOutcome);
  const outcomeAgents = agents.filter((a) => a.outcomeId === selectedOutcome);
  const outcome = outcomes.find((o) => o.id === selectedOutcome);

  const impacts = {
    model_upgrade: {
      label: "Model Upgrade (e.g., GPT-4.1 to GPT-4.5)",
      kpiDelta: +8,
      costDelta: +35,
      latencyDelta: -15,
      risk: "medium" as const,
      description: "Upgrading the model improves accuracy and reasoning but increases cost per run. KPIs relying on quality metrics will likely improve.",
    },
    model_downgrade: {
      label: "Model Downgrade (e.g., GPT-4.1 to GPT-4.1-mini)",
      kpiDelta: -12,
      costDelta: -60,
      latencyDelta: +25,
      risk: "high" as const,
      description: "Smaller model reduces cost significantly but may degrade quality. KPIs requiring complex reasoning will be most affected.",
    },
    tool_addition: {
      label: "Add Tool (e.g., Code Interpreter)",
      kpiDelta: +5,
      costDelta: +15,
      latencyDelta: -8,
      risk: "low" as const,
      description: "Adding a new tool expands agent capabilities. Minor cost increase but can improve task completion rates.",
    },
    workflow_optimization: {
      label: "Workflow Optimization (reduce steps)",
      kpiDelta: +3,
      costDelta: -20,
      latencyDelta: +20,
      risk: "low" as const,
      description: "Streamlining the workflow reduces latency and cost while maintaining or slightly improving KPI attainment.",
    },
  };

  const impact = impacts[changeType as keyof typeof impacts] || impacts.model_upgrade;

  return (
    <div className="flex flex-col gap-4" data-testid="scenario-planner">
      <div className="flex flex-col gap-2">
        <Label>Outcome Contract</Label>
        <Select value={selectedOutcome} onValueChange={(v) => { setSelectedOutcome(v); setSimulated(false); }}>
          <SelectTrigger data-testid="select-scenario-outcome">
            <SelectValue placeholder="Select outcome" />
          </SelectTrigger>
          <SelectContent>
            {outcomes.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Change Type</Label>
        <Select value={changeType} onValueChange={(v) => { setChangeType(v); setSimulated(false); }}>
          <SelectTrigger data-testid="select-change-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="model_upgrade">Model Upgrade</SelectItem>
            <SelectItem value="model_downgrade">Model Downgrade</SelectItem>
            <SelectItem value="tool_addition">Add Tool</SelectItem>
            <SelectItem value="workflow_optimization">Workflow Optimization</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{impact.description}</p>

      <Button variant="outline" onClick={() => setSimulated(true)} data-testid="button-run-simulation">
        <Gauge className="w-4 h-4 mr-1.5" /> Run Simulation
      </Button>

      {simulated && (
        <div className="flex flex-col gap-3 p-3 rounded-md border" data-testid="simulation-results">
          <span className="text-xs font-medium">Projected Impact on "{outcome?.name}"</span>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 text-center">
              <span className="text-[10px] text-muted-foreground">KPI Change</span>
              <span className={`text-sm font-semibold ${impact.kpiDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {impact.kpiDelta >= 0 ? "+" : ""}{impact.kpiDelta}%
              </span>
            </div>
            <div className="flex flex-col gap-1 text-center">
              <span className="text-[10px] text-muted-foreground">Cost Impact</span>
              <span className={`text-sm font-semibold ${impact.costDelta <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {impact.costDelta >= 0 ? "+" : ""}{impact.costDelta}%
              </span>
            </div>
            <div className="flex flex-col gap-1 text-center">
              <span className="text-[10px] text-muted-foreground">Latency</span>
              <span className={`text-sm font-semibold ${impact.latencyDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {impact.latencyDelta >= 0 ? "+" : ""}{impact.latencyDelta}%
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t">
            <span className="text-[10px] text-muted-foreground">Affected KPIs ({outcomeKpis.length})</span>
            {outcomeKpis.map((kpi) => {
              const currentAtt = kpi.target > 0 ? ((kpi.currentValue || 0) / kpi.target) * 100 : 0;
              const projected = Math.min(120, Math.max(0, currentAtt + impact.kpiDelta));
              return (
                <div key={kpi.id} className="flex items-center justify-between gap-2" data-testid={`sim-kpi-${kpi.id}`}>
                  <span className="text-xs truncate flex-1">{kpi.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{currentAtt.toFixed(0)}%</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className={`text-[10px] font-medium ${projected >= 100 ? "text-emerald-600 dark:text-emerald-400" : projected >= 80 ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {projected.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <span className="text-xs text-muted-foreground">Affected Agents: {outcomeAgents.length}</span>
            <Badge variant="outline" className="text-[10px] capitalize">Risk: {impact.risk}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
