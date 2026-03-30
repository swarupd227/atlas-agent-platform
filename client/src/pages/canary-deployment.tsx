import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { CanaryDeployment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Search,
  ChevronRight,
  BarChart3,
  Target,
  ArrowUp,
  ArrowDown,
  Minus,
  Zap,
  Users,
  DollarSign,
  Activity,
  TrendingUp,
  RotateCcw,
  Rocket,
  Filter,
  HeartPulse,
  Info,
  RefreshCw,
} from "lucide-react";

const TRAFFIC_STAGES = [1, 5, 25, 50, 100];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "configured", label: "Configured" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "rolled_back", label: "Rolled Back" },
];

function getStatusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s?.toLowerCase()) {
    case "active": return "default";
    case "configured": return "secondary";
    case "rolled_back": return "destructive";
    case "completed": return "outline";
    default: return "outline";
  }
}

function getStatusColor(s: string) {
  switch (s?.toLowerCase()) {
    case "active": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "configured": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "completed": return "bg-gray-500/15 text-gray-700 dark:text-gray-400";
    case "rolled_back": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "";
  }
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}



const INDUSTRY_PROMOTION_RULES: Record<string, string[]> = {
  healthcare: [
    "No adverse patient events for 24 hours",
    "Clinical accuracy above 97% threshold",
    "PHI exposure within approved limits",
  ],
  financial_services: [
    "Zero compliance violations in current stage",
    "Trade execution latency within SLA",
    "AUM exposure below risk threshold",
  ],
  manufacturing: [
    "No safety incidents in production lines",
    "Defect rate below 2% for 12 hours",
    "OEE maintained above 85%",
  ],
  insurance: [
    "Claims accuracy above 95%",
    "No regulatory filing delays",
    "Fraud detection rate above baseline",
  ],
  retail: [
    "Conversion rate within 2% of baseline",
    "No payment processing errors",
    "Customer satisfaction stable",
  ],
  technology_saas: [
    "SLO compliance above 99.9% for 4 hours",
    "Zero PII exposure events",
    "Error budget consumed < 25%",
  ],
};

const INDUSTRY_ROLLBACK_RULES: Record<string, string[]> = {
  healthcare: [
    "Any patient safety event detected",
    "Clinical accuracy drops below 95%",
    "HIPAA violation detected",
  ],
  financial_services: [
    "Compliance violation rate exceeds 0.5%",
    "Trade execution failure rate > 0.1%",
    "Regulatory alert triggered",
  ],
  manufacturing: [
    "Safety-critical equipment anomaly",
    "Defect rate exceeds 5%",
    "Production line stoppage",
  ],
  insurance: [
    "Claims processing error rate > 3%",
    "Fraud detection drops below 85%",
    "Solvency ratio breach",
  ],
  retail: [
    "Cart abandonment increases > 5%",
    "Payment failure rate > 0.5%",
    "Inventory sync failure detected",
  ],
  technology_saas: [
    "Error rate exceeds 2% for 10 minutes",
    "P99 latency exceeds 1000ms",
    "Data leak event detected",
  ],
};

const INDUSTRY_BLAST_RADIUS: Record<string, { warnings: string[]; metrics: { customers: number; interactions: number; revenue: string; regulatory: string } }> = {
  healthcare: {
    warnings: ["HIPAA-regulated data in scope at 25%+", "Patient-facing interactions require IRB review at 50%+"],
    metrics: { customers: 1250, interactions: 8400, revenue: "$2.1M", regulatory: "HIPAA, FDA" },
  },
  financial_services: {
    warnings: ["SOX-regulated transactions in scope at 25%+", "High-value client portfolios exposed at 50%+"],
    metrics: { customers: 3400, interactions: 45000, revenue: "$12.5M", regulatory: "SOX, MiFID II" },
  },
  manufacturing: {
    warnings: ["Safety-critical operations exposed at 25%+", "ISO 9001 audit scope affected at 50%+"],
    metrics: { customers: 85, interactions: 12000, revenue: "$4.8M", regulatory: "ISO 9001, OSHA" },
  },
  insurance: {
    warnings: ["Policyholder data in scope at 25%+", "Solvency reporting affected at 50%+"],
    metrics: { customers: 5200, interactions: 22000, revenue: "$8.3M", regulatory: "NAIC, Solvency II" },
  },
  retail: {
    warnings: ["PCI DSS scope expands at 25%+", "Customer PII exposure increases at 50%+"],
    metrics: { customers: 15000, interactions: 120000, revenue: "$3.2M", regulatory: "PCI DSS, CCPA" },
  },
  technology_saas: {
    warnings: ["SOC 2 audit scope widens at 25%+", "Multi-tenant data isolation at risk at 50%+"],
    metrics: { customers: 8500, interactions: 250000, revenue: "$6.4M", regulatory: "SOC 2, GDPR" },
  },
};

export default function CanaryDeploymentPage() {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const industryId = industry?.id || "financial_services";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState("traffic");

  const [createOpen, setCreateOpen] = useState(false);
  const [newDeployment, setNewDeployment] = useState({
    name: "",
    agentName: "",
    candidateVersion: "",
    baselineVersion: "",
    industry: industryId,
    autoPromote: false,
  });

  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const [addRuleType, setAddRuleType] = useState<"promotion" | "rollback">("promotion");
  const [newRuleText, setNewRuleText] = useState("");


  const { data: deployments = [], isLoading } = useQuery<CanaryDeployment[]>({
    queryKey: ["/api/canary-deployments"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/canary-deployments", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/canary-deployments"] });
      toast({ title: "Canary deployment created", description: created.name });
      setCreateOpen(false);
      setNewDeployment({ name: "", agentName: "", candidateVersion: "", baselineVersion: "", industry: industryId, autoPromote: false });
      setSelectedId(created.id);
    },
    onError: (e: any) => toast({ title: "Failed to create deployment", description: e.message, variant: "destructive" }),
  });

  const promoteMutation = useMutation({
    mutationFn: async ({ id, nextPercent }: { id: string; nextPercent: number }) => {
      const res = await apiRequest("PATCH", `/api/canary-deployments/${id}`, {
        currentTrafficPercent: nextPercent,
        status: nextPercent >= 100 ? "completed" : "active",
        lastPromotedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canary-deployments"] });
      toast({ title: "Traffic promoted to next stage" });
    },
    onError: (e: any) => toast({ title: "Promotion failed", description: e.message, variant: "destructive" }),
  });

  const rollbackMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/canary-deployments/${id}`, {
        currentTrafficPercent: 0,
        status: "rolled_back",
        rollbackTriggered: true,
        rollbackReason: "Manual rollback initiated",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canary-deployments"] });
      toast({ title: "Deployment rolled back" });
    },
    onError: (e: any) => toast({ title: "Rollback failed", description: e.message, variant: "destructive" }),
  });


  const addRuleMutation = useMutation({
    mutationFn: async ({ id, ruleType, rule }: { id: string; ruleType: "promotion" | "rollback"; rule: string }) => {
      const deployment = deployments.find((d) => d.id === id);
      if (!deployment) throw new Error("Deployment not found");
      const existingRules = ruleType === "promotion"
        ? (Array.isArray(deployment.promotionRules) ? deployment.promotionRules : [])
        : (Array.isArray(deployment.rollbackRules) ? deployment.rollbackRules : []);
      const updatedRules = [...existingRules, { text: rule, enabled: true }];
      const field = ruleType === "promotion" ? "promotionRules" : "rollbackRules";
      const res = await apiRequest("PATCH", `/api/canary-deployments/${id}`, { [field]: updatedRules });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/canary-deployments"] });
      toast({ title: "Rule added" });
      setAddRuleOpen(false);
      setNewRuleText("");
    },
    onError: (e: any) => toast({ title: "Failed to add rule", description: e.message, variant: "destructive" }),
  });

  // Load existing snapshot from deployments.canaryConfig.lastHealthSnapshot — uses authenticated query client
  const { data: snapshotQueryData } = useQuery<{ snapshot: Record<string, unknown> | null }>({
    queryKey: ["/api/canary-deployments", selectedId, "health-snapshot"],
    enabled: !!selectedId,
  });

  const healthSnapshotMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/canary-deployments/${id}/health-snapshot`, {});
      return res.json();
    },
    onSuccess: (data, id) => {
      queryClient.setQueryData(["/api/canary-deployments", id, "health-snapshot"], data);
      toast({ title: "Health signals refreshed" });
    },
    onError: (e: any) => toast({ title: "Health refresh failed", description: e.message, variant: "destructive" }),
  });

  function handleRefreshHealth() {
    if (!selected) return;
    healthSnapshotMutation.mutate(selected.id);
  }

  const filteredDeployments = useMemo(() => {
    let list = deployments;
    if (statusFilter !== "all") {
      list = list.filter((d) => d.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.agentName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [deployments, statusFilter, searchQuery]);

  const selected = useMemo(
    () => deployments.find((d) => d.id === selectedId) || null,
    [deployments, selectedId]
  );

  const selectedIndustry = selected?.industry || industryId;
  const defaultPromotionRules = INDUSTRY_PROMOTION_RULES[selectedIndustry] || INDUSTRY_PROMOTION_RULES.financial_services;
  const defaultRollbackRules = INDUSTRY_ROLLBACK_RULES[selectedIndustry] || INDUSTRY_ROLLBACK_RULES.financial_services;
  const blastRadiusData = INDUSTRY_BLAST_RADIUS[selectedIndustry] || INDUSTRY_BLAST_RADIUS.financial_services;

  function getCurrentStageIndex(percent: number) {
    for (let i = TRAFFIC_STAGES.length - 1; i >= 0; i--) {
      if (percent >= TRAFFIC_STAGES[i]) return i;
    }
    return -1;
  }

  function getNextStage(percent: number) {
    for (const stage of TRAFFIC_STAGES) {
      if (stage > percent) return stage;
    }
    return null;
  }

  function handleCreate() {
    createMutation.mutate({
      name: newDeployment.name,
      agentName: newDeployment.agentName,
      candidateVersion: newDeployment.candidateVersion,
      baselineVersion: newDeployment.baselineVersion,
      industry: newDeployment.industry,
      autoPromote: newDeployment.autoPromote,
      currentTrafficPercent: 0,
      targetTrafficPercent: 100,
      trafficStages: TRAFFIC_STAGES,
      industrySafetyGates: {},
      kpiBaseline: {},
      kpiCandidate: {},
      promotionRules: [],
      rollbackRules: [],
      blastRadius: {},
      status: "configured",
      incidentCount: 0,
      rollbackTriggered: false,
    });
  }

  function handlePromote() {
    if (!selected) return;
    const next = getNextStage(selected.currentTrafficPercent);
    if (next === null) return;
    promoteMutation.mutate({ id: selected.id, nextPercent: next });
  }

  function handleRollback() {
    if (!selected) return;
    rollbackMutation.mutate(selected.id);
  }

  function handleAddRule() {
    if (!selected || !newRuleText.trim()) return;
    addRuleMutation.mutate({ id: selected.id, ruleType: addRuleType, rule: newRuleText.trim() });
  }

  function openAddRuleDialog(type: "promotion" | "rollback") {
    setAddRuleType(type);
    setNewRuleText("");
    setAddRuleOpen(true);
  }

  const promotionRules = useMemo(() => {
    if (selected && Array.isArray(selected.promotionRules) && selected.promotionRules.length > 0) {
      return (selected.promotionRules as Array<{ text: string; enabled: boolean }>);
    }
    return defaultPromotionRules.map((r) => ({ text: r, enabled: true }));
  }, [selected, defaultPromotionRules]);

  const rollbackRules = useMemo(() => {
    if (selected && Array.isArray(selected.rollbackRules) && selected.rollbackRules.length > 0) {
      return (selected.rollbackRules as Array<{ text: string; enabled: boolean }>);
    }
    return defaultRollbackRules.map((r) => ({ text: r, enabled: true }));
  }, [selected, defaultRollbackRules]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="page-canary-deployment">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Canary Deployment Console</h1>
          <p className="text-sm text-muted-foreground">Graduated rollout with industry-specific safety controls</p>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left Column */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-canary-deployment"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Deployment
          </Button>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search deployments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-canary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={statusFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.key)}
                className="toggle-elevate text-xs"
                data-testid={`button-filter-${f.key.replace("_", "-")}`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-2 pr-2">
              {filteredDeployments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Rocket className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No deployments found</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a canary deployment to get started</p>
                </div>
              )}
              {filteredDeployments.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelectedId(d.id);
                    setDetailTab("traffic");
                  }}
                  className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                    selectedId === d.id ? "toggle-elevated border-blue-500/50" : ""
                  }`}
                  data-testid={`card-canary-${d.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block">{d.name}</span>
                      <span className="text-xs text-muted-foreground">{d.agentName}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <span>v{d.baselineVersion}</span>
                    <ArrowUp className="w-3 h-3" />
                    <span>v{d.candidateVersion}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <Badge variant={getStatusVariant(d.status)} className={`text-[10px] ${getStatusColor(d.status)}`}>
                      {d.status.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{d.currentTrafficPercent}% traffic</span>
                  </div>
                  {d.createdAt && (
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {timeAgo(d.createdAt as any)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right Column */}
        <div className="flex-1 min-w-0">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Rocket className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Select a deployment</p>
              <p className="text-sm text-muted-foreground mt-1">Choose from the left panel to view details</p>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" data-testid="text-deployment-name">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selected.agentName} - v{selected.baselineVersion} to v{selected.candidateVersion}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusVariant(selected.status)} className={getStatusColor(selected.status)}>
                    {selected.status.replace("_", " ")}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshHealth}
                    disabled={healthSnapshotMutation.isPending}
                    data-testid="button-run-analysis"
                  >
                    {healthSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1" />}
                    Run Analysis
                  </Button>
                </div>
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList>
                  <TabsTrigger value="traffic" data-testid="tab-traffic">
                    <Zap className="w-3.5 h-3.5 mr-1.5" />
                    Traffic Split
                  </TabsTrigger>
                  <TabsTrigger value="kpis" data-testid="tab-kpis">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    KPI Comparison
                  </TabsTrigger>
                  <TabsTrigger value="rules" data-testid="tab-rules">
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    Rules
                  </TabsTrigger>
                  <TabsTrigger value="blast-radius" data-testid="tab-blast-radius">
                    <Target className="w-3.5 h-3.5 mr-1.5" />
                    Blast Radius
                  </TabsTrigger>
                  <TabsTrigger value="health-signals" data-testid="tab-health-signals">
                    <HeartPulse className="w-3.5 h-3.5 mr-1.5" />
                    Health Signals
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Traffic Split */}
                <TabsContent value="traffic" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                      <CardTitle className="text-base">Traffic Distribution</CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handlePromote}
                          disabled={promoteMutation.isPending || selected.status === "rolled_back" || selected.status === "completed" || getNextStage(selected.currentTrafficPercent) === null}
                          data-testid="button-promote-stage"
                        >
                          {promoteMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <TrendingUp className="w-4 h-4 mr-1" />}
                          Promote to Next Stage
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleRollback}
                          disabled={rollbackMutation.isPending || selected.status === "rolled_back" || selected.currentTrafficPercent === 0}
                          data-testid="button-rollback"
                        >
                          {rollbackMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
                          Rollback
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-5xl font-bold" data-testid="text-traffic-percent">
                            {selected.currentTrafficPercent}%
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">Current Candidate Traffic</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {TRAFFIC_STAGES.map((stage, idx) => {
                          const currentIdx = getCurrentStageIndex(selected.currentTrafficPercent);
                          const isCompleted = idx <= currentIdx;
                          const isCurrent = stage === selected.currentTrafficPercent;
                          return (
                            <div key={stage} className="flex items-center gap-2">
                              <div
                                className={`flex items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                                  isCurrent
                                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/50"
                                    : isCompleted
                                    ? "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/50"
                                    : "text-muted-foreground"
                                }`}
                                data-testid={`stage-${stage}`}
                              >
                                {isCompleted && !isCurrent && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                                {isCurrent && <Activity className="w-3.5 h-3.5 mr-1.5" />}
                                {stage}%
                              </div>
                              {idx < TRAFFIC_STAGES.length - 1 && (
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="w-full bg-muted/50 rounded-md h-3 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-md transition-all duration-500"
                          style={{ width: `${selected.currentTrafficPercent}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                      <CardTitle className="text-base flex flex-wrap items-center gap-2">
                        <Shield className="w-4 h-4" />
                        Health Gate Summary
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshHealth}
                        disabled={healthSnapshotMutation.isPending}
                        data-testid="button-refresh-health-traffic"
                      >
                        {healthSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                        Refresh
                      </Button>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        const snapshot = snapshotQueryData?.snapshot || null;
                        const liveGates = snapshot?.gates as Record<string, { value: number | null; threshold: number | null; passes: boolean; unit: string }> | null;
                        const GATE_LABELS: Record<string, string> = {
                          errorRate: "Error Rate", avgLatency: "Avg Latency", policyCompliance: "Policy Compliance",
                          costDrift: "Cost Drift", downstreamFailureRate: "Downstream Failures", evalPassRate: "Eval Pass Rate",
                        };
                        if (!snapshot) {
                          return (
                            <div className="py-4 flex flex-col items-center gap-2 text-center" data-testid="safety-gates-pending">
                              <HeartPulse className="w-6 h-6 text-muted-foreground/40" />
                              <p className="text-sm text-muted-foreground">No health data yet — click <span className="font-medium">Refresh</span> or open the Health Signals tab.</p>
                            </div>
                          );
                        }
                        if ((snapshot as Record<string, unknown>).noAgentFound) {
                          return <p className="text-sm text-muted-foreground py-2" data-testid="safety-gates-no-agent">Agent <span className="font-medium">{selected.agentName}</span> not found — health gates unavailable.</p>;
                        }
                        if (!liveGates || Object.keys(liveGates).length === 0) {
                          return <p className="text-sm text-muted-foreground py-2">Insufficient trace data — health gates will populate once traces are recorded.</p>;
                        }
                        return (
                          <div className="space-y-2">
                            {Object.entries(liveGates).map(([key, gate]) => (
                              <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-b-0" data-testid={`safety-gate-${key}`}>
                                <span className="text-sm">{GATE_LABELS[key] || key}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {gate.value !== null ? (gate.unit === "ms" ? `${gate.value.toLocaleString()} ms` : gate.unit === "x" ? `${gate.value.toFixed(2)}×` : `${gate.value.toFixed(1)}${gate.unit}`) : "N/A"}
                                  </span>
                                  <Badge variant="outline" className={gate.passes ? "bg-green-500/15 text-green-700 dark:text-green-400 text-[10px]" : "bg-red-500/15 text-red-700 dark:text-red-400 text-[10px]"}>
                                    {gate.passes ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : <XCircle className="w-3 h-3 mr-1 inline" />}
                                    {gate.passes ? "Pass" : "Fail"}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 2: Live KPI Metrics — sourced from deployments.canaryConfig.lastHealthSnapshot */}
                <TabsContent value="kpis" className="space-y-4 mt-4">
                  {(() => {
                    const snapshot = snapshotQueryData?.snapshot || null;
                    const gates = snapshot?.gates as Record<string, { value: number | null; threshold: number | null; passes: boolean; unit: string }> | null;
                    const GATE_LABELS: Record<string, string> = {
                      errorRate: "Error Rate", avgLatency: "Avg Latency", policyCompliance: "Policy Compliance",
                      costDrift: "Cost-per-Run Drift", downstreamFailureRate: "Downstream Failure Rate", evalPassRate: "Eval Pass Rate",
                    };
                    const GATE_ORDER = ["errorRate", "avgLatency", "policyCompliance", "costDrift", "downstreamFailureRate", "evalPassRate"];
                    function formatLiveValue(key: string, v: number | null, unit: string) {
                      if (v === null) return "N/A";
                      if (unit === "x") return `${v.toFixed(2)}×`;
                      if (unit === "%") return `${v.toFixed(1)}%`;
                      if (unit === "ms") return `${v.toLocaleString()} ms`;
                      return `${v}`;
                    }
                    function formatTarget(key: string, t: number | null, unit: string) {
                      if (t === null) return "—";
                      if (key === "errorRate" || key === "downstreamFailureRate") return `≤ ${t}${unit}`;
                      if (key === "avgLatency") return `≤ ${t.toLocaleString()} ms`;
                      if (key === "costDrift") return `≤ ${t.toFixed(1)}×`;
                      return `≥ ${t}${unit}`;
                    }
                    return (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-base font-semibold">Live KPI Metrics</h3>
                            {snapshot && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                From {(snapshot as Record<string, unknown>).traceCount as number} traces · updated {new Date((snapshot as Record<string, unknown>).computedAt as string).toLocaleTimeString()}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefreshHealth}
                            disabled={healthSnapshotMutation.isPending}
                            data-testid="button-refresh-kpis"
                          >
                            {healthSnapshotMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1" />}
                            Refresh
                          </Button>
                        </div>

                        {!snapshot ? (
                          <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                              <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
                              <p className="text-sm font-medium">No live metrics yet</p>
                              <p className="text-xs text-muted-foreground max-w-xs">
                                Click <span className="font-medium">Refresh</span> or use Run Analysis to compute live metrics from recent traces.
                              </p>
                            </CardContent>
                          </Card>
                        ) : (snapshot as Record<string, unknown>).noAgentFound ? (
                          <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                              <XCircle className="w-8 h-8 text-muted-foreground/40" />
                              <p className="text-sm font-medium">Agent not found</p>
                              <p className="text-xs text-muted-foreground">No agent named <span className="font-medium">{selected.agentName}</span> found in the system.</p>
                            </CardContent>
                          </Card>
                        ) : !gates || Object.keys(gates).length === 0 ? (
                          <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                              <Activity className="w-8 h-8 text-muted-foreground/40" />
                              <p className="text-sm font-medium">Insufficient trace data</p>
                              <p className="text-xs text-muted-foreground">Fewer than 5 traces available. Metrics will populate once more traces are recorded.</p>
                            </CardContent>
                          </Card>
                        ) : (
                          <Card>
                            <CardContent className="p-0">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left p-3 font-medium text-muted-foreground">Metric</th>
                                      <th className="text-right p-3 font-medium text-muted-foreground">Live Value</th>
                                      <th className="text-right p-3 font-medium text-muted-foreground">Target</th>
                                      <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {GATE_ORDER.map(key => {
                                      const gate = gates[key];
                                      if (!gate) return null;
                                      return (
                                        <tr key={key} className="border-b last:border-b-0" data-testid={`kpi-row-${key}`}>
                                          <td className="p-3 font-medium">{GATE_LABELS[key] || key}</td>
                                          <td className="p-3 text-right font-semibold">{formatLiveValue(key, gate.value, gate.unit)}</td>
                                          <td className="p-3 text-right text-muted-foreground">{formatTarget(key, gate.threshold, gate.unit)}</td>
                                          <td className="p-3 text-center">
                                            <Badge variant="outline" className={gate.passes ? "bg-green-500/15 text-green-700 dark:text-green-400 text-[10px]" : "bg-red-500/15 text-red-700 dark:text-red-400 text-[10px]"}>
                                              {gate.passes ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> : <XCircle className="w-3 h-3 mr-1 inline" />}
                                              {gate.passes ? "Pass" : "Fail"}
                                            </Badge>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>

                {/* Tab 3: Rules */}
                <TabsContent value="rules" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          Auto-Promotion Rules
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAddRuleDialog("promotion")}
                          data-testid="button-add-promotion-rule"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Rule
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {promotionRules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 flex flex-wrap items-center justify-between gap-2"
                            data-testid={`promotion-rule-${idx}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              <span className="text-sm">{typeof rule === "string" ? rule : rule.text}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              {typeof rule === "string" || rule.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <h3 className="text-base font-semibold flex items-center gap-2">
                          <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400" />
                          Auto-Rollback Rules
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAddRuleDialog("rollback")}
                          data-testid="button-add-rollback-rule"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Rule
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {rollbackRules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="rounded-md border border-red-500/20 bg-red-500/5 p-3 flex flex-wrap items-center justify-between gap-2"
                            data-testid={`rollback-rule-${idx}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                              <span className="text-sm">{typeof rule === "string" ? rule : rule.text}</span>
                            </div>
                            <Badge variant="secondary" className="text-[10px]">
                              {typeof rule === "string" || rule.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 4: Blast Radius */}
                <TabsContent value="blast-radius" className="space-y-4 mt-4">
                  <h3 className="text-base font-semibold">Blast Radius at {selected.currentTrafficPercent}% Traffic</h3>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Customers Exposed</span>
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-customers">
                          {Math.round(blastRadiusData.metrics.customers * (selected.currentTrafficPercent / 100)).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">of {blastRadiusData.metrics.customers.toLocaleString()} total</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Activity className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Total Interactions</span>
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-interactions">
                          {Math.round(blastRadiusData.metrics.interactions * (selected.currentTrafficPercent / 100)).toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">of {blastRadiusData.metrics.interactions.toLocaleString()} total</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Revenue at Risk</span>
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-revenue">
                          {blastRadiusData.metrics.revenue}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">at full rollout</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Regulatory Scope</span>
                        </div>
                        <div className="text-lg font-bold" data-testid="stat-regulatory">
                          {blastRadiusData.metrics.regulatory}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">frameworks in scope</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Progressive Exposure by Stage</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-3 font-medium text-muted-foreground">Stage</th>
                              <th className="text-right p-3 font-medium text-muted-foreground">Customers</th>
                              <th className="text-right p-3 font-medium text-muted-foreground">Interactions</th>
                              <th className="text-right p-3 font-medium text-muted-foreground">Revenue Impact</th>
                              <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {TRAFFIC_STAGES.map((stage) => {
                              const customers = Math.round(blastRadiusData.metrics.customers * (stage / 100));
                              const interactions = Math.round(blastRadiusData.metrics.interactions * (stage / 100));
                              const revNum = parseFloat(blastRadiusData.metrics.revenue.replace(/[^0-9.]/g, ""));
                              const revImpact = `$${(revNum * (stage / 100)).toFixed(1)}M`;
                              const isActive = stage === selected.currentTrafficPercent;
                              const isCompleted = stage < selected.currentTrafficPercent;
                              return (
                                <tr key={stage} className={`border-b last:border-b-0 ${isActive ? "bg-blue-500/5" : ""}`} data-testid={`blast-stage-${stage}`}>
                                  <td className="p-3 font-medium">
                                    <div className="flex items-center gap-2">
                                      {stage}%
                                      {isActive && <Badge variant="default" className="text-[10px]">Current</Badge>}
                                      {isCompleted && <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400">Done</Badge>}
                                    </div>
                                  </td>
                                  <td className="p-3 text-right">{customers.toLocaleString()}</td>
                                  <td className="p-3 text-right">{interactions.toLocaleString()}</td>
                                  <td className="p-3 text-right">{revImpact}</td>
                                  <td className="p-3 text-center">
                                    {isActive && <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 mx-auto" />}
                                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mx-auto" />}
                                    {!isActive && !isCompleted && <Minus className="w-4 h-4 text-muted-foreground mx-auto" />}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {blastRadiusData.warnings.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex flex-wrap items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                          Industry Warnings
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {blastRadiusData.warnings.map((warning, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10"
                              data-testid={`warning-${idx}`}
                            >
                              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                              <span className="text-sm">{warning}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Tab 5: Health Signals */}
                <TabsContent value="health-signals" className="space-y-4 mt-4">
                  {(() => {
                    const snapshot = snapshotQueryData?.snapshot || null;
                    const gates = snapshot?.gates as Record<string, { value: number | null; threshold: number | null; passes: boolean; unit: string }> | null;

                    const GATE_LABELS: Record<string, string> = {
                      errorRate: "Error Rate",
                      avgLatency: "Avg Latency",
                      policyCompliance: "Policy Compliance",
                      costDrift: "Cost-per-Run Drift",
                      downstreamFailureRate: "Downstream Failure Rate",
                      evalPassRate: "Eval Pass Rate",
                    };

                    const GATE_DESCRIPTIONS: Record<string, string> = {
                      errorRate: "Fraction of recent traces that resulted in an error or failure",
                      avgLatency: "Mean latency across the last 50 traces",
                      policyCompliance: "Traces with no hard policy gate failures",
                      costDrift: "Ratio of canary avg cost-per-run vs agent baseline (1.0 = no drift)",
                      downstreamFailureRate: "Failure rate of child traces whose parent is a canary trace",
                      evalPassRate: "Average pass rate across all eval suites for this agent",
                    };

                    const GATE_ORDER = ["errorRate", "avgLatency", "policyCompliance", "costDrift", "downstreamFailureRate", "evalPassRate"];

                    function formatValue(key: string, v: number | null, unit: string) {
                      if (v === null) return "N/A";
                      if (unit === "x") return `${v.toFixed(2)}×`;
                      if (unit === "%") return `${v.toFixed(1)}%`;
                      if (unit === "ms") return `${v.toLocaleString()} ms`;
                      return `${v}`;
                    }

                    function formatThreshold(key: string, t: number | null, unit: string) {
                      if (t === null) return "—";
                      if (key === "errorRate" || key === "downstreamFailureRate") return `≤ ${t}${unit}`;
                      if (key === "avgLatency") return `≤ ${t.toLocaleString()} ms`;
                      if (key === "costDrift") return `≤ ${t.toFixed(1)}×`;
                      return `≥ ${t}${unit}`;
                    }

                    return (
                      <>
                        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-4 py-3 flex items-start gap-2.5" data-testid="notice-traffic-routing">
                          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-muted-foreground">
                            The traffic percentages shown reflect the <span className="font-medium text-foreground">recorded rollout stage</span>, not a live request-routing split. Real traffic-level canary routing requires a separate infrastructure layer.
                          </p>
                        </div>

                        <Card>
                          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
                            <CardTitle className="text-base flex items-center gap-2">
                              <HeartPulse className="w-4 h-4" />
                              Live Health Signals
                              {snapshot && (
                                <span className="text-xs font-normal text-muted-foreground ml-1">
                                  · updated {new Date(snapshot.computedAt as string).toLocaleTimeString()}
                                </span>
                              )}
                            </CardTitle>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRefreshHealth}
                              disabled={healthSnapshotMutation.isPending}
                              data-testid="button-refresh-health"
                            >
                              {healthSnapshotMutation.isPending
                                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                : <RefreshCw className="w-4 h-4 mr-1" />}
                              Refresh
                            </Button>
                          </CardHeader>
                          <CardContent>
                            {!snapshot ? (
                              <div className="flex flex-col items-center justify-center py-10 text-center gap-2" data-testid="health-pending-state">
                                <HeartPulse className="w-8 h-8 text-muted-foreground/40" />
                                <p className="text-sm font-medium">No health snapshot yet</p>
                                <p className="text-xs text-muted-foreground max-w-xs">
                                  Click <span className="font-medium">Refresh</span> to compute live health signals from recent traces for this agent.
                                </p>
                              </div>
                            ) : (snapshot as Record<string, unknown>).noAgentFound ? (
                              <div className="flex flex-col items-center justify-center py-10 text-center gap-2" data-testid="health-no-agent-state">
                                <XCircle className="w-8 h-8 text-muted-foreground/40" />
                                <p className="text-sm font-medium">Agent not found</p>
                                <p className="text-xs text-muted-foreground max-w-xs">
                                  No agent named <span className="font-medium">{selected.agentName}</span> was found in the system. Make sure the agent name matches exactly.
                                </p>
                              </div>
                            ) : !gates || Object.keys(gates).length === 0 ? (
                              <div className="flex flex-col items-center justify-center py-10 text-center gap-2" data-testid="health-insufficient-data">
                                <Activity className="w-8 h-8 text-muted-foreground/40" />
                                <p className="text-sm font-medium">Insufficient trace data</p>
                                <p className="text-xs text-muted-foreground">Fewer than 5 traces available. Health signals will appear once more traces are recorded.</p>
                              </div>
                            ) : (
                              <div className="space-y-0 divide-y">
                                {GATE_ORDER.map(key => {
                                  const gate = gates[key];
                                  if (!gate) return null;
                                  const isNA = gate.value === null;
                                  return (
                                    <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0" data-testid={`health-gate-${key}`}>
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium">{GATE_LABELS[key] || key}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{GATE_DESCRIPTIONS[key]}</p>
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                          <p className="text-sm font-semibold" data-testid={`health-value-${key}`}>
                                            {formatValue(key, gate.value, gate.unit)}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            threshold: {formatThreshold(key, gate.threshold, gate.unit)}
                                          </p>
                                        </div>
                                        <Badge
                                          variant="outline"
                                          className={isNA
                                            ? "bg-muted/50 text-muted-foreground text-[10px]"
                                            : gate.passes
                                              ? "bg-green-500/15 text-green-700 dark:text-green-400 text-[10px]"
                                              : "bg-red-500/15 text-red-700 dark:text-red-400 text-[10px]"}
                                          data-testid={`health-badge-${key}`}
                                        >
                                          {isNA
                                            ? "N/A"
                                            : gate.passes
                                              ? <><CheckCircle2 className="w-3 h-3 mr-1 inline" />Pass</>
                                              : <><XCircle className="w-3 h-3 mr-1 inline" />Fail</>}
                                        </Badge>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {snapshot && typeof (snapshot as Record<string, unknown>).allGatesPass === "boolean" && (
                          <div className={`rounded-md border px-4 py-3 flex items-center gap-2.5 ${(snapshot as Record<string, unknown>).allGatesPass ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`} data-testid="health-overall-verdict">
                            {(snapshot as Record<string, unknown>).allGatesPass
                              ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                              : <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
                            <p className="text-sm font-medium">
                              {(snapshot as Record<string, unknown>).allGatesPass
                                ? "All health gates passing — candidate is eligible for promotion"
                                : "One or more health gates failing — review signals before promoting"}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Create Deployment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Canary Deployment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Deployment Name</Label>
              <Input
                value={newDeployment.name}
                onChange={(e) => setNewDeployment({ ...newDeployment, name: e.target.value })}
                placeholder="e.g. Claims Agent v2.1 Rollout"
                data-testid="input-canary-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                value={newDeployment.agentName}
                onChange={(e) => setNewDeployment({ ...newDeployment, agentName: e.target.value })}
                placeholder="e.g. Claims Processor"
                data-testid="input-canary-agent-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Candidate Version</Label>
                <Input
                  value={newDeployment.candidateVersion}
                  onChange={(e) => setNewDeployment({ ...newDeployment, candidateVersion: e.target.value })}
                  placeholder="e.g. 2.1.0"
                  data-testid="input-canary-candidate-version"
                />
              </div>
              <div className="space-y-2">
                <Label>Baseline Version</Label>
                <Input
                  value={newDeployment.baselineVersion}
                  onChange={(e) => setNewDeployment({ ...newDeployment, baselineVersion: e.target.value })}
                  placeholder="e.g. 2.0.0"
                  data-testid="input-canary-baseline-version"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={newDeployment.industry || "financial_services"} onValueChange={(v) => setNewDeployment({ ...newDeployment, industry: v as any })}>
                <SelectTrigger data-testid="select-canary-industry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="financial_services">Financial Services</SelectItem>
                  <SelectItem value="manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="technology_saas">Technology / SaaS</SelectItem>
                  <SelectItem value="cross_industry">Cross-Industry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Auto-promote when gates pass</Label>
              <Switch
                checked={newDeployment.autoPromote}
                onCheckedChange={(checked) => setNewDeployment({ ...newDeployment, autoPromote: checked })}
                data-testid="switch-auto-promote"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-canary">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newDeployment.name || !newDeployment.agentName || !newDeployment.candidateVersion || !newDeployment.baselineVersion || createMutation.isPending}
              data-testid="button-create-canary"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Deployment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Dialog */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add {addRuleType === "promotion" ? "Promotion" : "Rollback"} Rule
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Rule Description</Label>
              <Input
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder={addRuleType === "promotion" ? "e.g. Error rate below 0.1% for 2 hours" : "e.g. Error rate exceeds 1%"}
                data-testid="input-rule-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddRuleOpen(false)} data-testid="button-cancel-rule">Cancel</Button>
            <Button
              onClick={handleAddRule}
              disabled={!newRuleText.trim() || addRuleMutation.isPending}
              variant={addRuleType === "rollback" ? "destructive" : "default"}
              data-testid="button-submit-rule"
            >
              {addRuleMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
