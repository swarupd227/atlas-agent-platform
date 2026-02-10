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
  Bot,
  Sparkles,
  Loader2,
  ChevronRight,
  Workflow,
  ArrowRight,
  Clock,
  FileText,
  Eye,
  ShieldCheck,
  History,
  Filter,
  Database,
  CircleDot,
  Download,
  RefreshCw,
  Pencil,
  ExternalLink,
  Package,
  Brain,
  FileCode,
  Settings,
  Calendar,
  ChevronDown,
  Hash,
  Users,
  Gavel,
  Search,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition, Approval, OutcomeEvent, Agent } from "@shared/schema";

function Sparkline({
  points,
  target,
  width = 120,
  height = 32,
  className,
}: {
  points: Array<{ date: string; value: number }>;
  target?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!points || points.length < 2) return null;
  const values = points.map((p) => p.value);
  const min = Math.min(...values, target ?? Infinity);
  const max = Math.max(...values, target ?? -Infinity);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pathPoints = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * w;
    const y = pad + h - ((p.value - min) / range) * h;
    return `${x},${y}`;
  });
  const d = `M${pathPoints.join(" L")}`;

  const targetY =
    target != null ? pad + h - ((target - min) / range) * h : null;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox={`0 0 ${width} ${height}`}
    >
      {targetY != null && (
        <line
          x1={pad}
          y1={targetY}
          x2={width - pad}
          y2={targetY}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3,3"
          className="text-muted-foreground/40"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      />
    </svg>
  );
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "N/A";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
}

export default function OutcomeDetail() {
  const [, params] = useRoute("/outcomes/:id");
  const outcomeId = params?.id;
  const { toast } = useToast();
  const [createKpiOpen, setCreateKpiOpen] = useState(false);
  const [editContractOpen, setEditContractOpen] = useState(false);
  const [editContractData, setEditContractData] = useState<Record<string, any>>({});
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [editKpiData, setEditKpiData] = useState<Record<string, any>>({});
  const [evidenceWindow, setEvidenceWindow] = useState("7d");
  const [roiInputs, setRoiInputs] = useState({
    currentTimeMins: 30,
    volumePerMonth: 500,
    hourlyRate: 75,
    automationPercent: 70,
    implementationCost: 25000,
    ongoingMonthlyCost: 500,
  });

  const { data: outcome, isLoading } = useQuery<OutcomeContract>({
    queryKey: ["/api/outcomes", outcomeId],
    enabled: !!outcomeId,
  });

  const { data: kpis } = useQuery<KpiDefinition[]>({
    queryKey: ["/api/outcomes", outcomeId, "kpis"],
    enabled: !!outcomeId,
  });

  const { data: evidence } = useQuery<{
    kpiTimeSeries: Array<{
      kpiId: string;
      kpiName: string;
      unit: string;
      target: number;
      baseline: number;
      points: Array<{ date: string; value: number }>;
    }>;
    correlatedMetrics: {
      successRate: number;
      avgLatency: number;
      totalRuns: number;
      failedRuns: number;
      latencyTrend: Array<{ date: string; value: number }>;
      agentCount: number;
    };
    dataQuality: {
      totalEvents: number;
      billableEvents: number;
      missingFieldRate: number;
      schemaConformance: number;
      lastEventAt: string | null;
    };
  }>({
    queryKey: ["/api/outcomes", outcomeId, "evidence"],
    enabled: !!outcomeId,
  });

  const { data: outcomeEvents } = useQuery<OutcomeEvent[]>({
    queryKey: ["/api/outcomes", outcomeId, "events"],
    enabled: !!outcomeId,
  });

  const { data: auditData } = useQuery<{
    auditEvents: Array<{
      id: string;
      objectType: string;
      objectId: string;
      action: string;
      actorId: string;
      details: any;
      timestamp: string;
      createdAt?: string;
    }>;
    approvals: Array<{
      id: string;
      type: string;
      status: string;
      objectName: string;
      decidedBy: string;
      decidedAt: string;
      riskScore: number;
      createdAt?: string;
    }>;
  }>({
    queryKey: ["/api/outcomes", outcomeId, "audit"],
    enabled: !!outcomeId,
  });

  const { data: snapshots } = useQuery<{
    snapshots: Array<{
      date: string;
      kpiValues: Array<{ kpiId: string; kpiName: string; value: number; confidence: number }>;
      topAgents: Array<{ agentId: string; agentName: string; contribution: number }>;
      eventCount: number;
      billableCount: number;
    }>;
  }>({
    queryKey: [`/api/outcomes/${outcomeId}/snapshots?window=${evidenceWindow}`],
    enabled: !!outcomeId,
  });

  const { data: invoices } = useQuery<Array<{id: string; status: string; totalAmount: number; periodStart: string; periodEnd: string; lineItems: any[]}>>({
    queryKey: ["/api/billing/invoices"],
  });

  const { data: allApprovals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const { data: allAgents } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const updateContractMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/outcomes/${outcomeId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      setEditContractOpen(false);
      toast({ title: "Contract updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update contract", description: err.message, variant: "destructive" });
    },
  });

  const recomputeKpis = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "kpis"] });
    queryClient.invalidateQueries({ queryKey: ["/api/outcomes", outcomeId, "evidence"] });
    queryClient.invalidateQueries({ predicate: (query) => (query.queryKey[0] as string)?.includes?.(`/api/outcomes/${outcomeId}/snapshots`) });
    toast({ title: "KPIs recomputed", description: "Data refreshed from latest events." });
  };

  const exportAuditBundle = async () => {
    try {
      const res = await apiRequest("POST", `/api/exports/outcome/${outcomeId}/audit`);
      const bundle = await res.json();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-bundle-${outcomeId?.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Audit bundle exported", description: `${bundle.totalAuditEvents} events, ${bundle.totalApprovals} approvals included.` });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

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

  const boundAgents = allAgents?.filter(a => a.outcomeId === outcomeId) || [];
  const outcomeApprovals = allApprovals?.filter(a => a.objectId === outcomeId) || [];
  const pendingApprovals = outcomeApprovals.filter(a => a.status === "pending");

  const recentEvents = outcomeEvents
    ? [...outcomeEvents]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 10)
    : [];
  const totalEventsCount = outcomeEvents?.length || 0;
  const billableEventsCount = outcomeEvents?.filter(e => e.billable).length || 0;
  const exclusionRate = totalEventsCount > 0 ? ((totalEventsCount - billableEventsCount) / totalEventsCount) * 100 : 0;
  const estimatedRevenue = billableEventsCount * (outcome.pricePerUnit || 0);

  const impactScore = Math.min(((outcome.pricePerUnit || 0) * 10 + (outcome.volumeCap || 100) / 100), 40);
  const complianceScore = Math.min(gates.length * 10, 30);
  const autonomyScore = Math.min(boundAgents.length * 10, 30);
  const riskScore = Math.round(Math.min(impactScore + complianceScore + autonomyScore, 100));

  const requiredApprovalRules =
    outcome.riskTier === "HIGH"
      ? ["All configuration changes", "KPI threshold modifications", "Billing & pricing changes", "Agent binding changes", "Risk parameter updates"]
      : outcome.riskTier === "MEDIUM"
        ? ["Billing & pricing changes", "KPI threshold modifications"]
        : ["Billing & pricing changes"];

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-outcome-detail">
      <div className="flex items-start gap-3 flex-wrap">
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
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Dialog open={editContractOpen} onOpenChange={(open) => {
            setEditContractOpen(open);
            if (open) {
              setEditContractData({
                name: outcome.name || "",
                description: outcome.description || "",
                riskTier: outcome.riskTier || "MEDIUM",
                status: outcome.status || "active",
                pricingModel: outcome.pricingModel || "PER_OUTCOME_EVENT",
                pricePerUnit: outcome.pricePerUnit ?? 0,
                currency: outcome.currency || "USD",
                volumeCap: outcome.volumeCap ?? "",
                riskThreshold: outcome.riskThreshold ?? 0.8,
                maxDriftPercent: outcome.maxDriftPercent ?? 10,
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-edit-contract">
                <Pencil className="w-4 h-4 mr-1.5" /> Edit
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Outcome Contract</DialogTitle>
              </DialogHeader>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateContractMutation.mutate({
                    name: editContractData.name,
                    description: editContractData.description,
                    riskTier: editContractData.riskTier,
                    status: editContractData.status,
                    pricingModel: editContractData.pricingModel,
                    pricePerUnit: parseFloat(editContractData.pricePerUnit) || 0,
                    currency: editContractData.currency,
                    volumeCap: editContractData.volumeCap ? parseInt(editContractData.volumeCap) : null,
                    riskThreshold: parseFloat(editContractData.riskThreshold) || 0.8,
                    maxDriftPercent: parseFloat(editContractData.maxDriftPercent) || 10,
                  });
                }}
              >
                <div className="flex flex-col gap-2">
                  <Label>Name</Label>
                  <Input value={editContractData.name || ""} onChange={(e) => setEditContractData({ ...editContractData, name: e.target.value })} data-testid="input-edit-name" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Description</Label>
                  <Textarea value={editContractData.description || ""} onChange={(e) => setEditContractData({ ...editContractData, description: e.target.value })} className="resize-none" data-testid="input-edit-description" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Risk Tier</Label>
                    <select value={editContractData.riskTier || "MEDIUM"} onChange={(e) => setEditContractData({ ...editContractData, riskTier: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-edit-risk-tier">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Status</Label>
                    <select value={editContractData.status || "active"} onChange={(e) => setEditContractData({ ...editContractData, status: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" data-testid="select-edit-status">
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Price / Unit</Label>
                    <Input type="number" step="0.01" value={editContractData.pricePerUnit ?? 0} onChange={(e) => setEditContractData({ ...editContractData, pricePerUnit: e.target.value })} data-testid="input-edit-price" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Currency</Label>
                    <Input value={editContractData.currency || "USD"} onChange={(e) => setEditContractData({ ...editContractData, currency: e.target.value })} data-testid="input-edit-currency" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Volume Cap</Label>
                    <Input type="number" value={editContractData.volumeCap ?? ""} onChange={(e) => setEditContractData({ ...editContractData, volumeCap: e.target.value })} placeholder="No cap" data-testid="input-edit-volume-cap" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label>Risk Threshold</Label>
                    <Input type="number" step="0.01" min="0" max="1" value={editContractData.riskThreshold ?? 0.8} onChange={(e) => setEditContractData({ ...editContractData, riskThreshold: e.target.value })} data-testid="input-edit-risk-threshold" />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Max Drift %</Label>
                    <Input type="number" step="0.1" value={editContractData.maxDriftPercent ?? 10} onChange={(e) => setEditContractData({ ...editContractData, maxDriftPercent: e.target.value })} data-testid="input-edit-max-drift" />
                  </div>
                </div>
                <Button type="submit" disabled={updateContractMutation.isPending} data-testid="button-submit-edit-contract">
                  {updateContractMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={recomputeKpis} data-testid="button-recompute-now">
            <RefreshCw className="w-4 h-4 mr-1.5" /> Recompute
          </Button>
          <Link href={`/agents/wizard?outcomeId=${outcomeId}&outcomeName=${encodeURIComponent(outcome.name)}`}>
            <Button variant="outline" data-testid="button-create-agent-from-outcome">
              <Bot className="w-4 h-4 mr-1.5" /> Create Agent
            </Button>
          </Link>
          <Button variant="outline" onClick={exportAuditBundle} data-testid="button-export-audit-bundle">
            <Download className="w-4 h-4 mr-1.5" /> Export Audit
          </Button>
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

      <Tabs defaultValue="definition" className="space-y-4">
        <TabsList>
          <TabsTrigger value="definition" data-testid="tab-definition">Definition</TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence</TabsTrigger>
          <TabsTrigger value="commercials" data-testid="tab-commercials">Commercials</TabsTrigger>
          <TabsTrigger value="risk" data-testid="tab-risk">Risk</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit</TabsTrigger>
          <TabsTrigger value="agents" data-testid="tab-agents">Agent Proposals</TabsTrigger>
        </TabsList>

        {/* Tab 1: Definition */}
        <TabsContent value="definition" className="space-y-6">
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
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Baseline</span>
                                {(() => {
                                  const aboveBaseline = kpi.baseline != null && kpi.target && (kpi.currentValue || 0) >= kpi.baseline;
                                  const colorClass = kpi.baseline != null && kpi.target
                                    ? (aboveBaseline ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
                                    : "";
                                  return <span className={`text-sm font-medium ${colorClass}`} data-testid={`text-baseline-${kpi.id}`}>{kpi.baseline ?? "N/A"} {kpi.unit}</span>;
                                })()}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</span>
                                {(() => {
                                  const meetsTarget = kpi.target
                                    ? (isInverse ? (kpi.currentValue || 0) <= kpi.target : (kpi.currentValue || 0) >= kpi.target)
                                    : null;
                                  const colorClass = meetsTarget != null
                                    ? (meetsTarget ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")
                                    : "";
                                  return <span className={`text-sm font-semibold ${colorClass}`} data-testid={`text-current-${kpi.id}`}>{kpi.currentValue ?? 0} {kpi.unit}</span>;
                                })()}
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
                            {(() => {
                              const kpiTs = evidence?.kpiTimeSeries?.find(ts => ts.kpiId === kpi.id);
                              if (!kpiTs || !kpiTs.points || kpiTs.points.length < 2) return null;
                              const lastPt = kpiTs.points[kpiTs.points.length - 1];
                              const firstPt = kpiTs.points[0];
                              const trendDir = lastPt.value > firstPt.value ? "up" : lastPt.value < firstPt.value ? "down" : "stable";
                              return (
                                <div className="flex flex-col items-center gap-1 shrink-0" data-testid={`kpi-sparkline-${kpi.id}`}>
                                  <Sparkline points={kpiTs.points} target={kpiTs.target} width={120} height={32} />
                                  <div className="flex items-center gap-1">
                                    {trendDir === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                    {trendDir === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
                                    {trendDir === "stable" && <Minus className="w-3 h-3 text-muted-foreground" />}
                                    <span className="text-[10px] text-muted-foreground">
                                      {trendDir === "up" ? "Trending up" : trendDir === "down" ? "Trending down" : "Stable"}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
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

                      {kpi.expression && (() => {
                        const expr = kpi.expression || "";
                        const fieldRefs = expr.match(/\b(status|type|amount|duration|count|value|score|rating|latency|time|cost)\b/gi) || [];
                        const eventFields = ["status", "type", "value", "amount"];
                        const missingFields = fieldRefs.filter(f => !eventFields.includes(f.toLowerCase()));
                        const sampleValue = kpi.currentValue || 0;
                        const dayRange = 7;
                        const dailyAvg = kpi.target ? (sampleValue / dayRange).toFixed(2) : "N/A";

                        return (
                          <div className="flex flex-col gap-2">
                            <div className="rounded-md bg-muted/50 p-3" data-testid={`expression-preview-${kpi.id}`}>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Expression</span>
                                <Badge variant="outline" className="text-[9px]">Formula</Badge>
                              </div>
                              <pre className="text-xs font-mono text-foreground overflow-x-auto">{expr}</pre>
                            </div>
                            <div className="rounded-md bg-primary/5 border border-primary/10 p-3" data-testid={`formula-preview-${kpi.id}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <Brain className="w-3.5 h-3.5 text-primary" />
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Sample Computation (Last 7 Days)</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3 text-xs">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-muted-foreground">Current Value</span>
                                  <span className="font-semibold">{sampleValue} {kpi.unit}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-muted-foreground">Daily Average</span>
                                  <span className="font-semibold">{dailyAvg} {kpi.unit}/day</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-muted-foreground">Projected (30d)</span>
                                  <span className="font-semibold">{kpi.target ? (parseFloat(dailyAvg as string) * 30).toFixed(1) : "N/A"} {kpi.unit}</span>
                                </div>
                              </div>
                            </div>
                            {missingFields.length > 0 && (
                              <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20" data-testid={`validation-warning-${kpi.id}`}>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                <span className="text-[11px] text-amber-700 dark:text-amber-300">
                                  Expression references fields that may not exist in outcome events: <span className="font-mono font-semibold">{missingFields.join(", ")}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Separator />

          <div>
            <h2 className="text-lg font-semibold">SLA Terms</h2>
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
                    <span className="text-sm font-semibold" data-testid="text-sla-success-rate">{sla.minSuccessRate ? `${(sla.minSuccessRate * 100).toFixed(1)}%` : "N/A"}</span>
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
                  <span className="text-sm font-semibold" data-testid="text-sla-latency">{sla.maxP95LatencyMs ? `${(sla.maxP95LatencyMs / 1000).toFixed(1)}s` : "N/A"}</span>
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
                  <span className="text-sm font-semibold" data-testid="text-sla-uptime">{sla.uptimePercent ? `${sla.uptimePercent}%` : "N/A"}</span>
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
                    <span className="text-sm font-semibold" data-testid="text-sla-penalty">{sla.breachPenaltyPercent ? `${sla.breachPenaltyPercent}%` : "N/A"}</span>
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

          <Separator />

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
                      <span className="text-sm font-medium capitalize" data-testid="text-attribution-model">{attribution.model?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Window</span>
                      <span className="text-sm font-medium" data-testid="text-attribution-window">{attribution.windowHours}h</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Trace Link</span>
                      <span className="text-sm font-medium flex items-center gap-1" data-testid="text-attribution-trace">
                        {attribution.requireTraceLink ? (
                          <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Required</>
                        ) : (
                          <><XCircle className="w-3.5 h-3.5 text-muted-foreground" /> Optional</>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Escalated</span>
                      <span className="text-sm font-medium flex items-center gap-1" data-testid="text-attribution-escalated">
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

        {/* Tab 2: Evidence */}
        <TabsContent value="evidence" className="space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Evidence</h2>
              <p className="text-sm text-muted-foreground">KPI trends, correlated metrics, and data quality signals</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Window:</span>
              <Select value={evidenceWindow} onValueChange={setEvidenceWindow}>
                <SelectTrigger className="w-24" data-testid="select-evidence-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="14d">14 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!evidence ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <>
              {evidence.kpiTimeSeries.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">KPI Time Series</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {evidence.kpiTimeSeries.map((kpiTs) => {
                      const lastPoint = kpiTs.points[kpiTs.points.length - 1];
                      const firstPoint = kpiTs.points[0];
                      const trendDir = lastPoint && firstPoint
                        ? lastPoint.value > firstPoint.value ? "up" : lastPoint.value < firstPoint.value ? "down" : "stable"
                        : "stable";
                      return (
                        <Card key={kpiTs.kpiId} data-testid={`card-kpi-timeseries-${kpiTs.kpiId}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <span className="text-sm font-semibold truncate">{kpiTs.kpiName}</span>
                                <span className="text-xs text-muted-foreground">
                                  Current: {lastPoint?.value ?? "N/A"} {kpiTs.unit} | Target: {kpiTs.target} {kpiTs.unit}
                                </span>
                                <div className="flex items-center gap-1 mt-0.5">
                                  {trendDir === "up" && <TrendingUp className="w-3 h-3 text-emerald-500" />}
                                  {trendDir === "down" && <TrendingDown className="w-3 h-3 text-red-500" />}
                                  {trendDir === "stable" && <Minus className="w-3 h-3 text-muted-foreground" />}
                                  <span className="text-[10px] text-muted-foreground">{evidenceWindow} trend</span>
                                </div>
                              </div>
                              <Sparkline
                                points={kpiTs.points}
                                target={kpiTs.target}
                                width={140}
                                height={40}
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3" data-testid="snapshot-timeline">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <h3 className="text-sm font-semibold">Snapshot Timeline</h3>
                  <div className="flex items-center gap-1">
                    {["7d", "30d", "90d"].map((w) => (
                      <Button
                        key={w}
                        variant={evidenceWindow === w ? "default" : "outline"}
                        size="sm"
                        onClick={() => setEvidenceWindow(w)}
                        data-testid={`button-window-${w}`}
                      >
                        {w}
                      </Button>
                    ))}
                  </div>
                </div>
                {snapshots?.snapshots && snapshots.snapshots.length > 0 ? (
                  <div className="space-y-0">
                    {[...snapshots.snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((snap, i, arr) => (
                      <div key={snap.date} className="flex gap-3" data-testid={`timeline-entry-${snap.date}`}>
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`w-3 h-3 rounded-full border-2 ${i === 0 ? "bg-primary border-primary" : "bg-background border-muted-foreground/30"}`} />
                          {i < arr.length - 1 && <div className="w-0.5 flex-1 bg-muted-foreground/20 min-h-[2rem]" />}
                        </div>
                        <Card className="flex-1 mb-3">
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-sm font-semibold">{snap.date}</span>
                                  {i === 0 && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/20">Latest</Badge>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[9px]">{snap.eventCount} events</Badge>
                                  <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">{snap.billableCount} billable</Badge>
                                </div>
                              </div>
                              {snap.kpiValues.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                                  {snap.kpiValues.map((kv) => (
                                    <div key={kv.kpiId} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50">
                                      <span className="text-[10px] text-muted-foreground truncate">{kv.kpiName}</span>
                                      <span className="text-sm font-semibold">{kv.value}</span>
                                      <Badge variant="outline" className={`text-[8px] w-fit ${
                                        (kv.confidence || 0) >= 0.8 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                        : (kv.confidence || 0) >= 0.5 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                        : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                                      }`}>
                                        {((kv.confidence || 0) * 100).toFixed(0)}% conf
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {snap.topAgents.length > 0 && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] text-muted-foreground">Top agents:</span>
                                  {snap.topAgents.map((a) => (
                                    <div key={a.agentId} className="flex items-center gap-1" data-testid={`badge-agent-${a.agentId}`}>
                                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                                        <Bot className="w-3 h-3 text-primary" />
                                      </div>
                                      <span className="text-[10px] font-medium">{a.agentName.length > 15 ? a.agentName.slice(0, 15) + "..." : a.agentName}</span>
                                      <Badge variant="outline" className="text-[8px]">{(a.contribution * 100).toFixed(0)}%</Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                      <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">No snapshot data available for this window</p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Correlated Metrics</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <Card data-testid="card-metric-success-rate">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.successRate}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-avg-latency">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Latency</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.avgLatency}ms</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-total-runs">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Runs</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.totalRuns}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-failed-runs">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed Runs</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.failedRuns}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-agent-count">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Agent Count</span>
                      <p className="text-lg font-semibold mt-1">{evidence.correlatedMetrics.agentCount}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {evidence.correlatedMetrics.latencyTrend.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Latency Trend ({evidenceWindow})</h3>
                  <Card data-testid="card-latency-trend">
                    <CardContent className="p-4 flex items-center gap-4">
                      <Sparkline
                        points={evidence.correlatedMetrics.latencyTrend}
                        width={240}
                        height={48}
                      />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-muted-foreground">Latest</span>
                        <span className="text-sm font-semibold">
                          {evidence.correlatedMetrics.latencyTrend[evidence.correlatedMetrics.latencyTrend.length - 1]?.value ?? 0}ms
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Data Quality Signals</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <Card data-testid="card-dq-total-events">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Events</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.totalEvents}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-billable-events">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Billable Events</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.billableEvents}</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-missing-field-rate">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Missing Field Rate</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.missingFieldRate}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-schema-conformance">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Schema Conformance</span>
                      <p className="text-lg font-semibold mt-1">{evidence.dataQuality.schemaConformance}%</p>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-dq-last-event">
                    <CardContent className="p-4">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Event</span>
                      <p className="text-sm font-semibold mt-1">{relativeTime(evidence.dataQuality.lastEventAt)}</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab 3: Commercials */}
        <TabsContent value="commercials" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Commercials</h2>
            <p className="text-sm text-muted-foreground">Pricing, metering rules, and outcome event activity</p>
          </div>

          <Card data-testid="metering-summary">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <Activity className="w-4 h-4 text-primary" /> Metering Summary
                <Badge variant="outline" className="text-[9px]">{outcome.pricingModel?.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{outcome.currency || "USD"} {outcome.pricePerUnit?.toFixed(2)} / unit</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  title="Total Events"
                  value={totalEventsCount}
                  icon={Database}
                  variant="default"
                  testId="stat-metering-total"
                />
                <StatCard
                  title="Billable Events"
                  value={billableEventsCount}
                  icon={CheckCircle}
                  variant="success"
                  testId="stat-metering-billable"
                />
                <StatCard
                  title="Exclusion Rate"
                  value={`${exclusionRate.toFixed(1)}%`}
                  icon={XCircle}
                  variant={exclusionRate > 20 ? "warning" : "default"}
                  testId="stat-metering-exclusion"
                />
                <StatCard
                  title="Est. Revenue"
                  value={`${outcome.currency || "USD"} ${estimatedRevenue.toFixed(2)}`}
                  icon={DollarSign}
                  variant="success"
                  testId="stat-metering-revenue"
                />
              </div>

              <div className="flex flex-col gap-1.5" data-testid="bar-billable-excluded">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Billable vs Excluded</span>
                  <span className="text-xs font-medium">{billableEventsCount} / {totalEventsCount}</span>
                </div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-muted/50">
                  {totalEventsCount > 0 && (
                    <>
                      <div
                        className="bg-emerald-500 rounded-l-full transition-all"
                        style={{ width: `${(billableEventsCount / totalEventsCount) * 100}%` }}
                      />
                      <div
                        className="bg-muted-foreground/20 rounded-r-full transition-all"
                        style={{ width: `${((totalEventsCount - billableEventsCount) / totalEventsCount) * 100}%` }}
                      />
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] text-muted-foreground">Billable ({totalEventsCount > 0 ? ((billableEventsCount / totalEventsCount) * 100).toFixed(1) : 0}%)</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/20" />
                    <span className="text-[10px] text-muted-foreground">Excluded ({totalEventsCount > 0 ? (((totalEventsCount - billableEventsCount) / totalEventsCount) * 100).toFixed(1) : 0}%)</span>
                  </div>
                </div>
              </div>

              {recentEvents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold">Recent Events</span>
                  <div className="divide-y rounded-md border">
                    {recentEvents.slice(0, 5).map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`metering-event-${evt.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <CircleDot className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-medium truncate">{evt.type}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {evt.billable ? (
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Billable</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20">Excluded</Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{relativeTime(evt.createdAt as string | null)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" /> Billing Model
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">Model</span>
                    <Select
                      value={outcome.pricingModel || "PER_OUTCOME_EVENT"}
                      onValueChange={(val) => {
                        updateContractMutation.mutate({ pricingModel: val });
                      }}
                    >
                      <SelectTrigger className="w-[180px]" data-testid="select-billing-model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PER_OUTCOME_EVENT">Per Outcome Event</SelectItem>
                        <SelectItem value="TIERED">Tiered</SelectItem>
                        <SelectItem value="FLAT_MONTHLY">Flat Monthly</SelectItem>
                        <SelectItem value="SUCCESS_FEE">Success Fee</SelectItem>
                        <SelectItem value="HYBRID">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
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
                      <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" data-testid={`text-tier-${i}`}>
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" /> Metering Rules
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Fraud Prevention</span>
                    <span className="text-xs text-muted-foreground">Duplicate detection window</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">60s window</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Retry Deduplication</span>
                    <span className="text-xs text-muted-foreground">Configurable dedup window</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">300s window</Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Minimum Quality Threshold</span>
                    <span className="text-xs text-muted-foreground">Events below threshold are excluded</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">0.7 score</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card data-testid="card-metering-exclusions">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-primary" /> Metering Exclusions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Test Events</span>
                      <span className="text-xs text-muted-foreground">Exclude events from test/staging environments</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">Active</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Escalated Events</span>
                      <span className="text-xs text-muted-foreground">Exclude events that required human intervention</span>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${attribution.excludeEscalated
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20"
                    }`}>{attribution.excludeEscalated ? "Active" : "Inactive"}</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Low Confidence</span>
                      <span className="text-xs text-muted-foreground">Exclude events below confidence threshold</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">{"<"}0.5 excluded</Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">Duplicate Window</span>
                      <span className="text-xs text-muted-foreground">Same-source events within window</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">60s</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-dispute-rules">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-primary" /> Dispute Rules
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Acceptable Evidence Types</span>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="outline" className="text-[9px]">Trace Logs</Badge>
                      <Badge variant="outline" className="text-[9px]">KPI Snapshots</Badge>
                      <Badge variant="outline" className="text-[9px]">Agent Run Records</Badge>
                      <Badge variant="outline" className="text-[9px]">Event Payloads</Badge>
                      <Badge variant="outline" className="text-[9px]">Audit Trail</Badge>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Lookback Windows</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Standard Dispute</span>
                      <span className="text-sm font-semibold">30 days</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Extended Dispute</span>
                      <span className="text-sm font-semibold">90 days</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Fraud Investigation</span>
                      <span className="text-sm font-semibold">180 days</span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Resolution SLA</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Acknowledgement</span>
                      <span className="text-sm font-semibold">24 hours</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-muted-foreground">Resolution</span>
                      <span className="text-sm font-semibold">7 business days</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-roi-calculator">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                <TrendingUp className="w-4 h-4 text-primary" /> ROI Projection Calculator
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Current Time / Task (mins)</Label>
                  <Input
                    type="number"
                    value={roiInputs.currentTimeMins}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, currentTimeMins: Math.max(0, parseInt(e.target.value) || 0) }))}
                    data-testid="input-roi-time"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Volume / Month</Label>
                  <Input
                    type="number"
                    value={roiInputs.volumePerMonth}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, volumePerMonth: Math.max(0, parseInt(e.target.value) || 0) }))}
                    data-testid="input-roi-volume"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Fully Loaded Hourly Rate ($)</Label>
                  <Input
                    type="number"
                    value={roiInputs.hourlyRate}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, hourlyRate: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    data-testid="input-roi-rate"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Automation Savings (%)</Label>
                  <Input
                    type="number"
                    value={roiInputs.automationPercent}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, automationPercent: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                    data-testid="input-roi-automation"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Implementation Cost ($)</Label>
                  <Input
                    type="number"
                    value={roiInputs.implementationCost}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, implementationCost: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    data-testid="input-roi-impl-cost"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Ongoing Monthly Cost ($)</Label>
                  <Input
                    type="number"
                    value={roiInputs.ongoingMonthlyCost}
                    onChange={(e) => setRoiInputs(prev => ({ ...prev, ongoingMonthlyCost: Math.max(0, parseFloat(e.target.value) || 0) }))}
                    data-testid="input-roi-ongoing-cost"
                  />
                </div>
              </div>

              <Separator />

              {(() => {
                const totalHoursMonth = (roiInputs.currentTimeMins * roiInputs.volumePerMonth) / 60;
                const currentMonthlyCost = totalHoursMonth * roiInputs.hourlyRate;
                const savedHours = totalHoursMonth * (roiInputs.automationPercent / 100);
                const monthlySavings = (currentMonthlyCost * (roiInputs.automationPercent / 100)) - roiInputs.ongoingMonthlyCost;
                const annualSavings = monthlySavings * 12;
                const paybackMonths = monthlySavings > 0 ? roiInputs.implementationCost / monthlySavings : Infinity;
                const roiPercent = roiInputs.implementationCost > 0 ? ((annualSavings - roiInputs.implementationCost) / roiInputs.implementationCost) * 100 : 0;

                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/50">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Savings</span>
                      <span className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-roi-monthly-savings">
                        ${monthlySavings > 0 ? monthlySavings.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{savedHours.toFixed(0)} hrs saved/mo</span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/50">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Annual Savings</span>
                      <span className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-roi-annual-savings">
                        ${annualSavings > 0 ? annualSavings.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/50">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Payback Period</span>
                      <span className="text-lg font-semibold" data-testid="text-roi-payback">
                        {paybackMonths === Infinity ? "N/A" : paybackMonths < 1 ? "< 1 mo" : `${paybackMonths.toFixed(1)} mo`}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/50">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">First-Year ROI</span>
                      <span className={`text-lg font-semibold ${roiPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-roi-percent">
                        {roiPercent.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {(() => {
            const relevantInvoices = invoices?.filter(inv =>
              inv.lineItems?.some((li: any) => li.outcomeId === outcomeId) || true
            ) || [];
            const latestInvoice = relevantInvoices.length > 0
              ? relevantInvoices.sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())[0]
              : null;

            return (
              <Card data-testid="invoice-status">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-primary" /> Invoice Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {latestInvoice ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Latest Invoice</span>
                          <Badge variant="outline" className={`text-[9px] ${
                            latestInvoice.status === "paid" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : latestInvoice.status === "sent" ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20"
                            : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          }`} data-testid="badge-invoice-status">
                            {latestInvoice.status.charAt(0).toUpperCase() + latestInvoice.status.slice(1)}
                          </Badge>
                        </div>
                        <span className="text-lg font-semibold" data-testid="text-invoice-amount">
                          {outcome.currency || "USD"} {latestInvoice.totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-invoice-period">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{latestInvoice.periodStart} - {latestInvoice.periodEnd}</span>
                      </div>
                      {relevantInvoices.length > 1 && (
                        <span className="text-[10px] text-muted-foreground">{relevantInvoices.length} total invoices on file</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground" data-testid="text-no-invoices">No invoices generated</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Recent Outcome Events</h3>
            {recentEvents.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                  <Database className="w-8 h-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No outcome events recorded yet</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {recentEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-event-${evt.id}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <CircleDot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">{evt.type}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              Agent: {evt.agentId ? evt.agentId.slice(0, 8) + "..." : "N/A"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {evt.billable ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-billable-${evt.id}`}>
                              Billable
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" data-testid={`badge-excluded-${evt.id}`}>
                              Excluded
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(evt.createdAt as string | null)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab 4: Risk */}
        <TabsContent value="risk" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Risk</h2>
            <p className="text-sm text-muted-foreground">Risk assessment, thresholds, and change impact analysis</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    <span className="text-sm font-semibold" data-testid="text-risk-threshold">{((outcome.riskThreshold || 0) * 100).toFixed(0)}%</span>
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
                    <span className="text-sm font-semibold" data-testid="text-max-drift">{outcome.maxDriftPercent || 0}%</span>
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
            <Card data-testid="card-risk-score">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" /> Risk Score
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative w-20 h-20">
                    <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        className="text-muted/30"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${riskScore}, 100`}
                        className={riskScore >= 70 ? "text-red-500" : riskScore >= 40 ? "text-amber-500" : "text-emerald-500"}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-lg font-semibold" data-testid="text-risk-score">{riskScore}</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground text-center">Composite score out of 100</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Risk Sub-Factors</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card data-testid="card-risk-impact">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-red-500/15 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Business Impact</span>
                      <span className="text-[10px] text-muted-foreground">Revenue & customer effect</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={outcome.riskTier === "CRITICAL" ? 90 : outcome.riskTier === "HIGH" ? 70 : outcome.riskTier === "MEDIUM" ? 45 : 20} className="h-1.5 flex-1" />
                    <span className="text-xs font-semibold">{outcome.riskTier === "CRITICAL" ? "9/10" : outcome.riskTier === "HIGH" ? "7/10" : outcome.riskTier === "MEDIUM" ? "5/10" : "2/10"}</span>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-risk-autonomy">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-amber-500/15 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Autonomy Scope</span>
                      <span className="text-[10px] text-muted-foreground">Decision authority level</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={boundAgents.length > 3 ? 80 : boundAgents.length > 1 ? 55 : 30} className="h-1.5 flex-1" />
                    <span className="text-xs font-semibold">{boundAgents.length > 3 ? "8/10" : boundAgents.length > 1 ? "6/10" : "3/10"}</span>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-risk-data-class">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-blue-500/15 flex items-center justify-center">
                      <Database className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Data Classification</span>
                      <span className="text-[10px] text-muted-foreground">Sensitivity & compliance</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={outcome.riskTier === "CRITICAL" ? 85 : outcome.riskTier === "HIGH" ? 60 : 35} className="h-1.5 flex-1" />
                    <span className="text-xs font-semibold">{outcome.riskTier === "CRITICAL" ? "9/10" : outcome.riskTier === "HIGH" ? "6/10" : "4/10"}</span>
                  </div>
                </CardContent>
              </Card>
              <Card data-testid="card-risk-write-actions">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-md bg-purple-500/15 flex items-center justify-center">
                      <Pencil className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">Write Actions</span>
                      <span className="text-[10px] text-muted-foreground">Mutation & side effects</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Progress value={outcome.riskTier === "CRITICAL" ? 95 : outcome.riskTier === "HIGH" ? 65 : 40} className="h-1.5 flex-1" />
                    <span className="text-xs font-semibold">{outcome.riskTier === "CRITICAL" ? "10/10" : outcome.riskTier === "HIGH" ? "7/10" : "4/10"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Change Impact</h3>
            {pendingApprovals.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
                  <CheckCircle className="w-8 h-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No pending approvals for this outcome</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map((approval) => (
                  <Card key={approval.id} data-testid={`card-pending-approval-${approval.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium truncate">{approval.objectName || approval.type}</span>
                            <span className="text-xs text-muted-foreground">{approval.description || approval.type.replace(/_/g, " ")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={approval.status} />
                          {approval.riskScore != null && (
                            <Badge variant="outline" className="text-[10px]">Risk: {((approval.riskScore || 0) * 100).toFixed(0)}%</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Required Expert Validations</h3>
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={outcome.riskTier} />
                    <span className="text-xs text-muted-foreground">Risk tier governs which changes require expert validation before execution</span>
                  </div>
                  {requiredApprovalRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 py-1" data-testid={`text-approval-rule-${i}`}>
                      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-sm">{rule}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Audit */}
        <TabsContent value="audit" className="space-y-6">
          <AuditTab outcomeId={outcomeId!} outcome={outcome} auditData={auditData} gates={gates} />
        </TabsContent>

        {/* Tab 6: Agent Proposals */}
        <TabsContent value="agents" className="space-y-4">
          <AgentProposalsTab outcome={outcome} kpis={kpis || []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuditTab({
  outcomeId,
  outcome,
  auditData,
  gates,
}: {
  outcomeId: string;
  outcome: OutcomeContract;
  auditData: {
    auditEvents: Array<{
      id: string;
      objectType: string;
      objectId: string;
      action: string;
      actorId: string;
      details: any;
      timestamp: string;
      createdAt?: string;
    }>;
    approvals: Array<{
      id: string;
      type: string;
      status: string;
      objectName: string;
      decidedBy: string;
      decidedAt: string;
      riskScore: number;
      createdAt?: string;
    }>;
  } | undefined;
  gates: Array<Record<string, any>>;
}) {
  const [auditFilter, setAuditFilter] = useState<"all" | "changes" | "approvals">("all");

  const timelineEntries: Array<{
    id: string;
    kind: "audit" | "approval";
    action: string;
    actor: string;
    timestamp: string;
    details?: any;
    status?: string;
    riskScore?: number;
  }> = [];

  if (auditData) {
    for (const evt of auditData.auditEvents) {
      timelineEntries.push({
        id: evt.id,
        kind: "audit",
        action: evt.action,
        actor: evt.actorId || "system",
        timestamp: evt.timestamp || evt.createdAt || "",
        details: evt.details,
      });
    }
    for (const appr of auditData.approvals) {
      timelineEntries.push({
        id: appr.id,
        kind: "approval",
        action: `${appr.type} - ${appr.status}`,
        actor: appr.decidedBy || "pending",
        timestamp: appr.decidedAt || appr.createdAt || "",
        status: appr.status,
        riskScore: appr.riskScore,
      });
    }
  }

  timelineEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredEntries =
    auditFilter === "all"
      ? timelineEntries
      : auditFilter === "changes"
        ? timelineEntries.filter((e) => e.kind === "audit")
        : timelineEntries.filter((e) => e.kind === "approval");

  const actionIcon = (action: string, kind: string) => {
    if (kind === "approval") return <ShieldCheck className="w-4 h-4 text-primary" />;
    if (action.includes("create")) return <Plus className="w-4 h-4 text-emerald-500" />;
    if (action.includes("update") || action.includes("edit")) return <Edit3 className="w-4 h-4 text-amber-500" />;
    if (action.includes("delete")) return <Trash2 className="w-4 h-4 text-red-500" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  const { data: versions } = useQuery<Array<{
    version: number;
    changedAt: string;
    changedBy: string;
    summary: string;
    diff: Record<string, { from: any; to: any }>;
  }>>({
    queryKey: ["/api/outcomes", outcomeId, "versions"],
  });

  return (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Audit Trail</h2>
          <p className="text-sm text-muted-foreground">Contract versions, changes, and approval decisions</p>
        </div>
        <Badge variant="outline" className="text-[10px]" data-testid="badge-version">v{outcome.version}</Badge>
      </div>

      {versions && versions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Contract Version History</h3>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {versions.map((ver, i) => (
                  <div key={ver.version} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-version-${ver.version}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/30"}`} />
                        {i < versions.length - 1 && <div className="w-0.5 h-4 bg-muted-foreground/20" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">v{ver.version}</span>
                          {i === 0 && <Badge variant="outline" className="text-[9px] bg-primary/15 text-primary border-primary/20">Current</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{ver.summary}</span>
                        <span className="text-[10px] text-muted-foreground">by {ver.changedBy}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {Object.keys(ver.diff || {}).length > 0 && (
                        <Badge variant="outline" className="text-[9px]">{Object.keys(ver.diff).length} fields</Badge>
                      )}
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime(ver.changedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={auditFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("all")}
          data-testid="button-filter-all"
        >
          All
        </Button>
        <Button
          variant={auditFilter === "changes" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("changes")}
          data-testid="button-filter-changes"
        >
          Changes
        </Button>
        <Button
          variant={auditFilter === "approvals" ? "default" : "outline"}
          size="sm"
          onClick={() => setAuditFilter("approvals")}
          data-testid="button-filter-approvals"
        >
          Approvals
        </Button>
      </div>

      {!auditData ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <History className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No audit events recorded</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <Card key={entry.id} data-testid={`card-audit-${entry.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {actionIcon(entry.action, entry.kind)}
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{entry.action.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">by {entry.actor}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {entry.kind === "approval" && entry.status === "approved" && (
                      <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-signed-${entry.id}`}>
                        <CheckCircle className="w-3 h-3 mr-0.5" /> Signed
                      </Badge>
                    )}
                    {entry.status && <StatusBadge status={entry.status} />}
                    {entry.riskScore != null && entry.riskScore > 0 && (
                      <Badge variant="outline" className="text-[10px]">Risk: {(entry.riskScore * 100).toFixed(0)}%</Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-audit-time-${entry.id}`}>
                      {relativeTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {gates.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold">Configured Gates</h3>
            <p className="text-xs text-muted-foreground">Lifecycle stages requiring expert validation</p>
          </div>
          <div className="space-y-2">
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
        </>
      )}
    </>
  );
}

interface AgentProposal {
  name: string;
  description: string;
  role: string;
  riskTier: string;
  autonomyMode: string;
  modelProvider: string;
  modelName: string;
  workflowSteps: string[];
  tools: Array<{ name: string; description: string }>;
  kpiBindings: string[];
  estimatedImpact: string;
  templateMatch: string | null;
}

function AgentProposalsTab({ outcome, kpis }: { outcome: OutcomeContract; kpis: KpiDefinition[] }) {
  const { toast } = useToast();
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });
  const outcomeReview = approvals?.find(
    (a) => a.type === "outcome_review" && a.objectId === outcome.id
  );
  const isPendingValidation = outcomeReview?.status === "pending";
  const isValidated = outcomeReview?.status === "approved";

  const createAgentMutation = useMutation({
    mutationFn: async (agent: AgentProposal) => {
      const res = await apiRequest("POST", "/api/agents", {
        name: agent.name,
        description: agent.description,
        owner: "system",
        riskTier: agent.riskTier,
        autonomyMode: agent.autonomyMode,
        modelProvider: agent.modelProvider,
        modelName: agent.modelName,
        outcomeId: outcome.id,
        toolsConfig: agent.tools,
      });
      return res.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent created", description: `"${created.name}" has been created and linked to this outcome.` });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create agent", description: err.message, variant: "destructive" });
    },
  });

  async function generateProposals() {
    setGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/ai/propose-agents", {
        outcomeContract: outcome,
        kpis,
      });
      const data = await res.json();
      setProposals(data.agents || []);
      setGenerated(true);
    } catch (err) {
      toast({ title: "Failed to generate proposals", description: "Please try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  if (!generated) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center flex flex-col gap-1">
            <h3 className="text-base font-semibold">Agent Proposals</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Let AI analyze this outcome contract and its KPIs to propose the right agents — with workflows, tools, and autonomy levels already configured.
            </p>
          </div>
          {isPendingValidation && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/10 max-w-md flex-wrap" data-testid="notice-pending-validation">
              <Shield className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">Pending Expert Validation</span>
                <span className="text-[11px] text-muted-foreground">This outcome is awaiting expert review. You can still generate proposals, but agents should only be created after validation.</span>
              </div>
            </div>
          )}
          {isValidated && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/5 border border-green-500/10 max-w-md flex-wrap" data-testid="notice-validated">
              <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-xs text-green-700 dark:text-green-300">Outcome validated by expert — ready for agent creation</span>
            </div>
          )}
          <Button onClick={generateProposals} disabled={generating} data-testid="button-generate-proposals">
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                Analyzing outcome...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Generate Agent Proposals
              </>
            )}
          </Button>
          {kpis.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Define KPIs first for better agent proposals</p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Proposed Agents</h2>
          <p className="text-sm text-muted-foreground">AI-generated agents to deliver this outcome. Review and create the ones you need.</p>
        </div>
        <Button variant="outline" onClick={generateProposals} disabled={generating} data-testid="button-regenerate-proposals">
          {generating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          Regenerate
        </Button>
      </div>

      {isPendingValidation && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-amber-500/5 border border-amber-500/10 flex-wrap" data-testid="notice-pending-validation-proposals">
          <Shield className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground">This outcome is pending expert validation. Agent creation is recommended only after validation is complete.</span>
          <Link href="/approvals">
            <Button variant="outline" size="sm" data-testid="button-go-to-approvals">
              <ArrowRight className="w-3.5 h-3.5 mr-1" /> Go to Approvals
            </Button>
          </Link>
        </div>
      )}

      {proposals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 gap-2">
            <Bot className="w-8 h-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No agent proposals generated. Try regenerating.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proposals.map((agent, i) => (
            <Card key={i} data-testid={`card-agent-proposal-${i}`}>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                  <Bot className="w-4 h-4 text-primary" />
                  {agent.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">{agent.description}</p>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{agent.riskTier} Risk</Badge>
                  <Badge variant="outline" className="text-[10px]">{agent.autonomyMode}</Badge>
                  <Badge variant="outline" className="text-[10px]">{agent.modelProvider}/{agent.modelName}</Badge>
                  {agent.templateMatch && (
                    <Badge variant="secondary" className="text-[10px]">Template: {agent.templateMatch}</Badge>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Role</span>
                  <span className="text-xs">{agent.role}</span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Workflow</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {agent.workflowSteps.map((step, j) => (
                      <span key={j} className="flex items-center gap-0.5">
                        {j > 0 && <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />}
                        <Badge variant="secondary" className="text-[9px]">{step}</Badge>
                      </span>
                    ))}
                  </div>
                </div>

                {agent.tools.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tools</span>
                    <div className="flex flex-wrap gap-1">
                      {agent.tools.map((tool, j) => (
                        <Badge key={j} variant="outline" className="text-[9px]">{tool.name}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {agent.kpiBindings.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">KPI Bindings</span>
                    <div className="flex flex-wrap gap-1">
                      {agent.kpiBindings.map((kpi, j) => (
                        <Badge key={j} variant="outline" className="text-[9px] text-green-600 dark:text-green-400 border-green-200 dark:border-green-800">{kpi}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 p-2 rounded-md bg-green-500/5 border border-green-500/10 flex-wrap">
                  <TrendingUp className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="text-[11px] text-green-700 dark:text-green-300">{agent.estimatedImpact}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    className="flex-1"
                    onClick={() => createAgentMutation.mutate(agent)}
                    disabled={createAgentMutation.isPending}
                    data-testid={`button-create-agent-${i}`}
                  >
                    {createAgentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Create Agent
                  </Button>
                  <Link href={`/agents/wizard?outcomeId=${outcome.id}&outcomeName=${encodeURIComponent(outcome.name)}&name=${encodeURIComponent(agent.name)}&description=${encodeURIComponent(agent.description)}&riskTier=${agent.riskTier}&autonomyMode=${agent.autonomyMode}`}>
                    <Button variant="outline" data-testid={`button-customize-agent-${i}`}>
                      <Edit3 className="w-4 h-4 mr-1.5" />
                      Customize
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
