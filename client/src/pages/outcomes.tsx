import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Target,
  Plus,
  DollarSign,
  Search,
  ArrowRight,
  BarChart3,
  Sparkles,
  XCircle,
  Activity,
  Users,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Download,
  Filter,
  Gavel,
  Bot,
  Trash2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import {
  ProgressRing,
  WaterfallChart,
  RiskHeatBadge,
} from "@/components/outcome-cockpit";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { usePermission, PermissionGate, useRole } from "@/components/role-provider";
import { useIndustry } from "@/components/industry-provider";

import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OutcomeContract, KpiDefinition, Invoice, Agent } from "@shared/schema";

function getIndustryBenchmark(industry: string, kpiName: string, kpiUnit: string): { benchmark: number; unit: string; source: string; comparison: string } | null {
  const nameLower = kpiName.toLowerCase();
  const universalBenchmarks: Array<{ keywords: string[]; data: { benchmark: number; unit: string; source: string } }> = [
    { keywords: ["autonomous resolution", "resolution rate", "resolutions"], data: { benchmark: 85, unit: "percent", source: "Industry avg (Gartner 2024)" } },
    { keywords: ["customer satisfaction", "csat", "satisfaction"], data: { benchmark: 78, unit: "score", source: "Industry avg (ACSI)" } },
    { keywords: ["response time", "avg response", "latency"], data: { benchmark: 120, unit: "seconds", source: "Industry avg (McKinsey)" } },
    { keywords: ["conversion rate", "conversion"], data: { benchmark: 3.5, unit: "percent", source: "Industry avg (Monetate)" } },
    { keywords: ["extraction accuracy", "accuracy"], data: { benchmark: 95, unit: "percent", source: "Industry benchmark" } },
    { keywords: ["leads qualified", "lead qualification"], data: { benchmark: 250, unit: "count", source: "Industry avg (HubSpot)" } },
    { keywords: ["items moderated", "moderation", "content moderation"], data: { benchmark: 10000, unit: "count", source: "Industry avg (Trust & Safety)" } },
    { keywords: ["invoices processed", "invoice processing"], data: { benchmark: 500, unit: "count", source: "Industry avg (Ardent Partners)" } },
    { keywords: ["processing time"], data: { benchmark: 120, unit: "seconds", source: "Industry avg (McKinsey)" } },
    { keywords: ["compliance score"], data: { benchmark: 92, unit: "percent", source: "Regulatory benchmark" } },
    { keywords: ["fraud detection"], data: { benchmark: 78, unit: "percent", source: "Industry avg (Nilson Report)" } },
  ];

  const industryOverrides: Record<string, Array<{ keywords: string[]; data: { benchmark: number; unit: string; source: string } }>> = {
    financial_services: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 82, unit: "percent", source: "FinServ avg (Gartner 2024)" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 76, unit: "score", source: "J.D. Power Banking" } },
      { keywords: ["response time", "avg response"], data: { benchmark: 90, unit: "seconds", source: "FCA benchmark" } },
      { keywords: ["compliance score"], data: { benchmark: 94, unit: "percent", source: "SOX/Basel III standard" } },
    ],
    healthcare: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 88, unit: "percent", source: "HEDIS measure" } },
      { keywords: ["customer satisfaction", "patient satisfaction", "satisfaction"], data: { benchmark: 82, unit: "score", source: "CAHPS benchmark" } },
      { keywords: ["response time", "avg response"], data: { benchmark: 180, unit: "seconds", source: "CMS guideline" } },
      { keywords: ["accuracy", "extraction accuracy"], data: { benchmark: 97, unit: "percent", source: "FDA AI/ML guidance" } },
    ],
    insurance: [
      { keywords: ["autonomous resolution", "resolutions"], data: { benchmark: 90, unit: "percent", source: "ACORD benchmark" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 80, unit: "score", source: "J.D. Power Insurance" } },
      { keywords: ["invoices processed", "claims"], data: { benchmark: 400, unit: "count", source: "Industry avg (Novarica)" } },
    ],
    manufacturing: [
      { keywords: ["accuracy", "extraction accuracy"], data: { benchmark: 99, unit: "percent", source: "ISO 9001 standard" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 75, unit: "score", source: "IndustryWeek avg" } },
    ],
    retail: [
      { keywords: ["conversion rate", "conversion"], data: { benchmark: 3.2, unit: "percent", source: "Industry avg (Monetate)" } },
      { keywords: ["customer satisfaction", "satisfaction"], data: { benchmark: 80, unit: "score", source: "ACSI Retail" } },
      { keywords: ["items moderated", "moderation"], data: { benchmark: 15000, unit: "count", source: "Trust & Safety avg" } },
    ],
  };

  const overrides = industryOverrides[industry] || [];
  for (const entry of overrides) {
    if (entry.keywords.some(kw => nameLower.includes(kw))) {
      return { ...entry.data, comparison: "" };
    }
  }
  for (const entry of universalBenchmarks) {
    if (entry.keywords.some(kw => nameLower.includes(kw))) {
      return { ...entry.data, comparison: "" };
    }
  }
  return null;
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
      <span className="text-xs text-muted-foreground">SLA</span>
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
  const [filterRiskTier, setFilterRiskTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");
  const [filterBillingModel, setFilterBillingModel] = useState("all");
  const [, navigate] = useLocation();
  const [expandedKpis, setExpandedKpis] = useState(false);
  const { toast } = useToast();
  const outcomesPerm = usePermission("create_modify_outcomes");
  const { isBusinessMode } = useRole();
  const { industry } = useIndustry();
  const industryId = industry?.id || "";

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showAllOutcomes, setShowAllOutcomes] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
  const { data: outcomeEvents } = useQuery<Array<{ id: string; outcomeId: string; billable: boolean; amount: number }>>({
    queryKey: ["/api/outcome-events"],
  });
  const [waterfallOutcome, setWaterfallOutcome] = useState<string | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/outcomes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setDeleteConfirmId(null);
      toast({ title: "Outcome deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete outcome", description: err.message, variant: "destructive" });
    },
  });

  const deleteConfirmOutcome = outcomes?.find((o) => o.id === deleteConfirmId);

  const outcomeOwnerMap: Record<string, string[]> = {};
  for (const a of (agents || [])) {
    if (a.outcomeId && a.owner) {
      if (!outcomeOwnerMap[a.outcomeId]) outcomeOwnerMap[a.outcomeId] = [];
      if (!outcomeOwnerMap[a.outcomeId].includes(a.owner)) outcomeOwnerMap[a.outcomeId].push(a.owner);
    }
  }
  const uniqueOwners = Array.from(new Set(Object.values(outcomeOwnerMap).flat()));

  const getOutcomeBillingStatus = (outcomeId: string) => {
    const outcomeInvoices = (invoices || []).filter((i) => i.outcomeId === outcomeId);
    if (outcomeInvoices.length === 0) return "no_invoices";
    const hasOverdue = outcomeInvoices.some((i) =>
      i.status === "pending" && i.periodEnd && new Date(i.periodEnd).getTime() < Date.now()
    );
    if (hasOverdue) return "overdue";
    const hasPending = outcomeInvoices.some((i) => i.status === "pending");
    if (hasPending) return "pending";
    const allPaid = outcomeInvoices.every((i) => i.status === "paid");
    if (allPaid) return "paid";
    return "mixed";
  };


  const filtered = outcomes?.filter((o) => {
    if (search && !o.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRiskTier !== "all" && o.riskTier !== filterRiskTier) return false;
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterOwner !== "all" && !(outcomeOwnerMap[o.id] || []).includes(filterOwner)) return false;
    if (filterBillingModel !== "all" && o.pricingModel !== filterBillingModel) return false;
    return true;
  });

  const hasActiveFilters = filterRiskTier !== "all" || filterStatus !== "all" || filterOwner !== "all" || filterBillingModel !== "all";
  const activeFilterCount = [filterRiskTier, filterStatus, filterOwner, filterBillingModel].filter(v => v !== "all").length;

  const sorted = [...(filtered || [])].sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });
  const hasMoreOutcomes = sorted.length > 6;
  const visibleOutcomes = showAllOutcomes ? sorted : sorted.slice(0, 6);

  const handleExportJson = () => {
    if (!outcomes || !kpis) return;
    const exportData = outcomes.map((o) => ({
      id: o.id,
      name: o.name,
      status: o.status,
      riskTier: o.riskTier,
      pricingModel: o.pricingModel,
      pricePerUnit: o.pricePerUnit,
      kpis: (kpis || []).filter((k) => k.outcomeId === o.id).map((k) => ({
        name: k.name,
        current: k.currentValue,
        target: k.target,
        unit: k.unit,
        attainment: k.target > 0 ? `${(((k.currentValue || 0) / k.target) * 100).toFixed(1)}%` : "N/A",
      })),
      agentsContributing: (agents || []).filter((a) => a.outcomeId === o.id).length,
      billingStatus: getOutcomeBillingStatus(o.id),
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outcomes-summary-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Outcome summary exported" });
  };

  const billedRevenue = invoices?.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const pendingRevenue = invoices?.filter((i) => i.status === "pending").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const disputedRevenue = invoices?.filter((i) => i.status === "disputed").reduce((s, i) => s + (i.amount || 0), 0) || 0;
  const totalRevenue = billedRevenue + pendingRevenue + disputedRevenue;
  const activeContracts = outcomes?.filter((o) => o.status === "active" || o.status === "awaiting_agent_plan" || o.status === "agents_assigned")?.length || 0;
  const awaitingPlanCount = outcomes?.filter((o) => o.status === "awaiting_agent_plan")?.length || 0;

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


  const getAgentsForOutcome = (outcomeId: string) => {
    return (agents || []).filter((a) => a.outcomeId === outcomeId);
  };

  const getOutcomeWaterfallSteps = (outcomeId: string) => {
    const events = (outcomeEvents || []).filter((e) => e.outcomeId === outcomeId);
    const gross = events.length;
    const exclusions = events.filter((e) => !e.billable).length;
    const netBillable = events.filter((e) => e.billable).length;
    const outcomeInvoices = (invoices || []).filter((i) => i.outcomeId === outcomeId && (i.status === "paid" || i.status === "finalized"));
    const revenue = outcomeInvoices.reduce((s, i) => s + (i.amount || 0), 0);
    return [
      { label: "Gross Events", value: gross, type: "gross" as const },
      { label: "Exclusions", value: exclusions, type: "deduction" as const },
      { label: "Net Billable", value: netBillable, type: "net" as const },
      { label: "Revenue", value: Math.round(revenue * 100) / 100, type: "net" as const },
    ];
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

  if (isBusinessMode) {
    const businessSorted = [...(outcomes || [])].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    function getBusinessStatus(outcomeId: string): "on-track" | "at-risk" | "paused" {
      const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcomeId) || [];
      const outcomeObj = outcomes?.find((o) => o.id === outcomeId);
      if (outcomeObj?.status === "paused") return "paused";
      if (outcomeKpis.length === 0) return "on-track";
      const avgPct = outcomeKpis.reduce((s, k) => s + (k.target > 0 ? ((k.currentValue || 0) / k.target) * 100 : 100), 0) / outcomeKpis.length;
      return avgPct >= 75 ? "on-track" : "at-risk";
    }

    const statusConfig = {
      "on-track": { label: "On Track", pillCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20", barCls: "bg-emerald-500" },
      "at-risk": { label: "At Risk", pillCls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20", barCls: "bg-amber-500" },
      "paused": { label: "Paused", pillCls: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20", barCls: "bg-slate-400" },
    };

    const activeCount = businessSorted.filter((o) => o.status === "active" || o.status === "agents_assigned").length;
    const atRiskCount = businessSorted.filter((o) => getBusinessStatus(o.id) === "at-risk").length;
    const totalValue = invoices?.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount || 0), 0) || 0;

    return (
      <div className="flex flex-col gap-5 p-6" data-testid="page-outcomes">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Your AI Initiatives</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} running{atRiskCount > 0 && (
                <span className="ml-1.5 text-amber-600 dark:text-amber-400 font-medium">· {atRiskCount} need{atRiskCount === 1 ? "s" : ""} attention</span>
              )}
            </p>
          </div>
          <Button onClick={() => navigate("/outcomes/discover")} data-testid="button-start-outcome">
            <Plus className="w-4 h-4 mr-1.5" />
            Start a new outcome
          </Button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3" data-testid="section-business-summary">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground">Active initiatives</span>
              <span className="text-xl font-semibold text-primary">{activeCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/10 shrink-0">
              <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground">Value generated</span>
              <span className="text-xl font-semibold text-emerald-600 dark:text-emerald-400">
                {totalValue > 0 ? `$${Math.round(totalValue).toLocaleString()}` : "—"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card col-span-2 xl:col-span-1">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-amber-500/10 shrink-0">
              <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-muted-foreground">Overall goal attainment</span>
              <span className="text-xl font-semibold">{overallAttainment.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        {businessSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-state-outcomes">
            <div className="flex items-center justify-center w-14 h-14 rounded-md bg-primary/10">
              <Target className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center flex flex-col gap-1">
              <p className="text-base font-medium">No AI initiatives yet</p>
              <p className="text-sm text-muted-foreground max-w-md">
                Start by defining an outcome — what business goal should AI help you achieve?
              </p>
            </div>
            <Button onClick={() => navigate("/outcomes/discover")} data-testid="button-create-first-outcome">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Start a new outcome
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-foreground">All initiatives</h2>
            <div className="flex flex-col gap-2" data-testid="section-business-outcomes">
              {businessSorted.map((outcome) => {
                const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcome.id) || [];
                const status = getBusinessStatus(outcome.id);
                const cfg = statusConfig[status];
                const avgPct = outcomeKpis.length
                  ? Math.round(outcomeKpis.reduce((s, k) => s + (k.target > 0 ? Math.min(100, ((k.currentValue || 0) / k.target) * 100) : 100), 0) / outcomeKpis.length)
                  : 0;
                const topKpi = outcomeKpis[0];
                const outcomeInvoices = (invoices || []).filter((i) => i.outcomeId === outcome.id && i.status === "paid");
                const valueGenerated = outcomeInvoices.reduce((s, i) => s + (i.amount || 0), 0);

                return (
                  <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
                    <div
                      className="rounded-lg border bg-card px-4 py-3 hover:bg-accent/20 cursor-pointer transition-colors"
                      data-testid={`card-outcome-business-${outcome.id}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-semibold truncate">{outcome.name}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.pillCls}`}>{cfg.label}</span>
                          </div>
                          {topKpi && (
                            <p className="text-xs text-muted-foreground">
                              Goal: {topKpi.name} — currently at{" "}
                              <span className="font-medium text-foreground">{(topKpi.currentValue || 0).toLocaleString()} {topKpi.unit}</span>
                              {" "}(target: {topKpi.target.toLocaleString()})
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                          <span className={`text-lg font-bold ${status === "at-risk" ? "text-amber-600 dark:text-amber-400" : status === "paused" ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {avgPct}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">to target</span>
                          {valueGenerated > 0 && (
                            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">${Math.round(valueGenerated).toLocaleString()} generated</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-1.5 rounded-full transition-all ${cfg.barCls}`} style={{ width: `${Math.min(avgPct, 100)}%` }} />
                      </div>
                      {outcomeKpis.length > 1 && (
                        <div className="flex items-center gap-3 mt-2 pt-2 border-t">
                          {outcomeKpis.slice(0, 3).map((k) => {
                            const pct = k.target > 0 ? Math.min(100, ((k.currentValue || 0) / k.target) * 100) : 0;
                            return (
                              <div key={k.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                                {pct >= 75
                                  ? <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                                  : <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />}
                                <span className="truncate max-w-[120px]">{k.name}</span>
                              </div>
                            );
                          })}
                          <ArrowRight className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
          <DialogContent className="max-w-sm" data-testid="dialog-delete-outcome">
            <DialogHeader>
              <DialogTitle className="text-base">Remove Initiative</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to remove <span className="font-medium text-foreground">{deleteConfirmOutcome?.name}</span>? All associated data will be removed.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">Cancel</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? "Removing..." : "Remove"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
          {!outcomesPerm.allowed ? (
            <Button disabled title="You do not have permission to create outcome contracts" data-testid="button-create-outcome">
              <Plus className="w-4 h-4 mr-1.5" /> New Contract
            </Button>
          ) : (
            <Button onClick={() => navigate("/outcomes/discover")} data-testid="button-create-outcome">
              <Plus className="w-4 h-4 mr-1.5" /> New Contract
              {outcomesPerm.permission.access === "conditional" && outcomesPerm.permission.annotation && (
                <Badge variant="secondary" className="text-xs ml-1">{outcomesPerm.permission.annotation}</Badge>
              )}
            </Button>
          )}
        </div>
      </div>

      {awaitingPlanCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/20" data-testid="banner-awaiting-agent-plan">
          <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-xs text-blue-700 dark:text-blue-300 flex-1">
            {awaitingPlanCount} outcome{awaitingPlanCount !== 1 ? "s" : ""} awaiting Agent Development Plan — Agent Engineers can generate proposals from the outcome detail page.
          </span>
        </div>
      )}

      {/* === KPI TILES + REVENUE STRIP === */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="section-kpi-tiles">
        <Card data-testid="stat-overall-attainment">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Overall KPI Attainment</span>
                <span className="text-2xl font-semibold tracking-tight">{overallAttainment.toFixed(1)}%</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs" data-testid="badge-exceeded">{exceededKpis.length} exceeded</Badge>
                  <Badge variant="outline" className="text-xs" data-testid="badge-on-track">{onTrackKpis.length} on track</Badge>
                  {atRiskKpis.length > 0 && (
                    <Badge variant="destructive" className="text-xs" data-testid="badge-at-risk">{atRiskKpis.length} at risk</Badge>
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
                    <span className="text-xs text-muted-foreground">${billedRevenue.toLocaleString()} billed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400" />
                    <span className="text-xs text-muted-foreground">${pendingRevenue.toLocaleString()} pending</span>
                  </div>
                  {disputedRevenue > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 dark:bg-red-400" />
                      <span className="text-xs text-muted-foreground">${disputedRevenue.toLocaleString()} disputed</span>
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
              <Badge variant="outline" className="text-xs">{kpis?.length || 0} KPIs</Badge>
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
                      <span className="text-xs font-medium truncate">{kpi.name}</span>
                      <div className="flex items-center gap-2">
                        <ProgressRing value={Math.min(100, kpi.attainment)} size={36} strokeWidth={3} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold tabular-nums">
                            {typeof kpi.currentValue === "number" && kpi.currentValue % 1 !== 0
                              ? kpi.currentValue.toFixed(1)
                              : kpi.currentValue || 0}
                            <span className="text-xs text-muted-foreground font-normal">
                              {" "}/ {kpi.target} {kpi.unit}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground truncate">{outcomeName}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* === OUTCOME CONTRACTS LIST === */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search contracts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-outcomes"
            />
          </div>

          <Button
            variant={showFilters || hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
          >
            <Filter className="w-3.5 h-3.5 mr-1" />
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
            <ChevronRight className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-150 ${showFilters ? "rotate-90" : ""}`} />
          </Button>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterRiskTier("all");
                setFilterStatus("all");
                setFilterOwner("all");
                setFilterBillingModel("all");
              }}
              data-testid="button-clear-filters"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportJson}
              data-testid="button-export-json"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Export JSON
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 flex-wrap" data-testid="section-filter-dropdowns">
            <Select value={filterRiskTier} onValueChange={setFilterRiskTier}>
              <SelectTrigger className="w-[130px]" data-testid="filter-risk-tier">
                <SelectValue placeholder="Risk Tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Tiers</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px]" data-testid="filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            {uniqueOwners.length > 0 && (
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="w-[130px]" data-testid="filter-owner">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {uniqueOwners.map((owner) => (
                    <SelectItem key={owner} value={owner}>{owner}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={filterBillingModel} onValueChange={setFilterBillingModel}>
              <SelectTrigger className="w-[150px]" data-testid="filter-billing-model">
                <SelectValue placeholder="Billing Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Models</SelectItem>
                <SelectItem value="PER_OUTCOME_EVENT">Per Event</SelectItem>
                <SelectItem value="FIXED_MONTHLY">Fixed Monthly</SelectItem>
                <SelectItem value="TIERED">Tiered</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleOutcomes.map((outcome) => {
          const outcomeKpis = kpis?.filter((k) => k.outcomeId === outcome.id) || [];
          const avgProgress = outcomeKpis.length
            ? outcomeKpis.reduce((sum, k) => sum + (k.target ? ((k.currentValue || 0) / k.target) * 100 : 0), 0) / outcomeKpis.length
            : 0;
          const boundAgents = getAgentsForOutcome(outcome.id);
          const sla = (outcome.slaConfig || {}) as Record<string, number>;
          return (
            <Link key={outcome.id} href={`/outcomes/${outcome.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-outcome-${outcome.id}`}>
                <CardContent className="p-4 flex flex-col gap-3 overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                        <Target className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-semibold truncate">{outcome.name}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top">{outcome.name}</TooltipContent>
                        </Tooltip>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">v{outcome.version}</span>
                          <RiskHeatBadge level={outcome.riskTier || "medium"} />
                          {(() => {
                            const regs = industry?.regulatoryFrameworks?.slice(0, 3) || [];
                            if (regs.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 flex-wrap" data-testid={`regulatory-tags-${outcome.id}`}>
                                <Gavel className="w-3 h-3 text-muted-foreground shrink-0" />
                                {regs.map(reg => (
                                  <Badge key={reg} variant="outline" className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20">{reg}</Badge>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <ProgressRing value={Math.round(avgProgress)} size={36} strokeWidth={3} />
                    </div>
                  </div>
                  {outcome.description && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-muted-foreground line-clamp-2">{outcome.description}</p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">{outcome.description}</TooltipContent>
                    </Tooltip>
                  )}
                  {outcomeKpis.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {outcomeKpis.slice(0, 2).map((kpi) => {
                        const kpiPct = kpi.target > 0 ? Math.round(((kpi.currentValue || 0) / kpi.target) * 100) : 0;
                        return (
                          <div key={kpi.id} className="flex items-center gap-2">
                            <div className="shrink-0">
                              <ProgressRing value={kpiPct} size={24} strokeWidth={2} />
                            </div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground truncate flex-1">{kpi.name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top">{kpi.name}</TooltipContent>
                            </Tooltip>
                            {(() => {
                              const bm = getIndustryBenchmark(industryId, kpi.name, kpi.unit);
                              if (!bm) return null;
                              const isInverse = kpi.name.includes("Time") || kpi.name.includes("Latency");
                              const isBetter = isInverse ? (kpi.currentValue || 0) < bm.benchmark : (kpi.currentValue || 0) > bm.benchmark;
                              return (
                                <span className={`text-xs shrink-0 ${isBetter ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} data-testid={`benchmark-indicator-${kpi.id}`}>
                                  {isBetter ? "above" : "below"} avg
                                </span>
                              );
                            })()}
                            <span className="text-xs tabular-nums shrink-0">
                              {(kpi.currentValue || 0).toLocaleString()}/{kpi.target.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-wrap pt-1 border-t">
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{outcomeKpis.length} KPIs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {outcome.currency || "$"}{outcome.pricePerUnit}/unit
                      </span>
                    </div>
                    <SlaTrafficLight outcome={outcome} kpis={kpis || []} agents={agents || []} />
                    {boundAgents.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{boundAgents.length} agents</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={outcome.status} />
                      {(() => {
                        const bs = getOutcomeBillingStatus(outcome.id);
                        if (bs === "no_invoices") return null;
                        const bsConfig: Record<string, { label: string; cls: string }> = {
                          paid: { label: "Paid", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
                          pending: { label: "Pending", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
                          overdue: { label: "Overdue", cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
                          mixed: { label: "Mixed", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
                        };
                        const cfg = bsConfig[bs];
                        if (!cfg) return null;
                        return (
                          <Badge variant="outline" className={`text-xs border ${cfg.cls}`} data-testid={`billing-status-${outcome.id}`}>
                            {cfg.label}
                          </Badge>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setWaterfallOutcome(waterfallOutcome === outcome.id ? null : outcome.id);
                        }}
                        data-testid={`button-waterfall-toggle-${outcome.id}`}
                      >
                        <BarChart3 className="w-3 h-3" />
                      </Button>
                      {outcomesPerm.permission.access !== "denied" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-red-500"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeleteConfirmId(outcome.id);
                          }}
                          data-testid={`button-delete-outcome-${outcome.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  {waterfallOutcome === outcome.id && (
                    <div className="pt-2 border-t" data-testid={`waterfall-drilldown-${outcome.id}`}>
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Revenue Flow</span>
                      <WaterfallChart steps={getOutcomeWaterfallSteps(outcome.id)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {hasMoreOutcomes && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs px-3"
            onClick={() => setShowAllOutcomes(!showAllOutcomes)}
            data-testid="toggle-show-all-outcomes"
          >
            {showAllOutcomes ? "Show less" : `Show all ${sorted.length} outcomes`}
            <ChevronRight className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-150 ${showAllOutcomes ? "rotate-90" : ""}`} />
          </Button>
        </div>
      )}

      {sorted.length === 0 && !hasActiveFilters && !search && (
        <div className="flex flex-col items-center justify-center py-16 gap-4" data-testid="empty-state-outcomes">
          <div className="flex items-center justify-center w-14 h-14 rounded-md bg-primary/10">
            <Target className="w-7 h-7 text-primary" />
          </div>
          <div className="text-center flex flex-col gap-1">
            <p className="text-base font-medium">Define outcomes first. Agents come second.</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Start by creating outcome contracts that define what business results you want to achieve. Then bind agents to deliver them.
            </p>
          </div>
          <Link href="/outcomes/discover">
            <Button data-testid="button-create-first-outcome">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Outcome Builder
            </Button>
          </Link>
        </div>
      )}
      {sorted.length === 0 && (hasActiveFilters || search) && (
        <div className="flex flex-col items-center justify-center py-12 gap-3" data-testid="empty-state-filtered">
          <Filter className="w-10 h-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No outcome contracts match your filters</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilterRiskTier("all");
              setFilterStatus("all");
              setFilterOwner("all");
              setFilterBillingModel("all");
            }}
            data-testid="button-clear-all-filters"
          >
            Clear All Filters
          </Button>
        </div>
      )}

      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-delete-outcome">
          <DialogHeader>
            <DialogTitle className="text-base">Delete Outcome Contract</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <span className="font-medium text-foreground">{deleteConfirmOutcome?.name}</span>? This will also remove all associated KPIs, events, and invoices. Linked agents will be unlinked but not deleted.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteMutation.isPending}
                onClick={() => { if (deleteConfirmId) deleteMutation.mutate(deleteConfirmId); }}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

