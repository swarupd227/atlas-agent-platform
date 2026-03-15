import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Bot,
  Plus,
  Search,
  Activity,
  DollarSign,
  Clock,
  Shield,
  Zap,
  ArrowRight,
  Filter,
  X,
  Play,
  Pause,
  KeyRound,
  FileDown,
  ChevronDown,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  Globe,
  Network,
  ArrowUpDown,
  CircleDot,
  Minus,
  Trash2,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { usePermission, PermissionGate, useRole } from "@/components/role-provider";
import { useIndustry } from "@/components/industry-provider";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, OutcomeContract, Approval } from "@shared/schema";

type SortBy = "recent" | "name" | "revenue" | "margin" | "roi" | "health" | "safety";

const EU_AI_ACT_MAP: Record<string, { label: string; className: string }> = {
  CRITICAL: { label: "Unacceptable Risk", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20" },
  HIGH: { label: "High Risk", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  MEDIUM: { label: "Limited Risk", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  LOW: { label: "Minimal Risk", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
};

function getIndustryDomain(agent: Agent): string {
  if (agent.department) return agent.department;
  const tags = agent.ontologyTags as Record<string, unknown> | string[] | null;
  if (tags && Array.isArray(tags) && tags.length > 0) return String(tags[0]);
  if (tags && typeof tags === "object" && !Array.isArray(tags)) {
    const keys = Object.keys(tags);
    if (keys.length > 0) return keys[0];
  }
  return "General";
}

function getOntologyCount(agent: Agent): number {
  const tags = agent.ontologyTags as Record<string, unknown> | string[] | null;
  if (!tags) return 0;
  if (Array.isArray(tags)) return tags.length;
  if (typeof tags === "object") return Object.keys(tags).length;
  return 0;
}

function getEvalCoverage(agent: Agent): number {
  const bindings = agent.evalBindings as Record<string, unknown> | unknown[] | null;
  if (!bindings) return 0;
  if (Array.isArray(bindings)) {
    if (bindings.length === 0) return 0;
    return Math.min(100, bindings.length * 25);
  }
  if (typeof bindings === "object") {
    const keys = Object.keys(bindings);
    if (keys.length === 0) return 0;
    return Math.min(100, keys.length * 25);
  }
  return 0;
}

function getPipelineStatus(agent: Agent): "passed" | "partial" | "none" {
  if (agent.environment === "prod") return "passed";
  if (agent.environment === "pilot" || agent.environment === "staging") return "partial";
  return "none";
}

function computeSafetyScore(agent: Agent, lastApproval: Approval | undefined): number {
  let score = 0;
  const pipeline = getPipelineStatus(agent);
  if (pipeline === "passed") score += 35;
  else if (pipeline === "partial") score += 15;
  const evalCov = getEvalCoverage(agent);
  score += (evalCov / 100) * 35;
  const tags = (agent.complianceTags as string[]) || [];
  if (tags.length > 0) score += 15;
  if (lastApproval && lastApproval.status === "approved") score += 15;
  return Math.min(100, Math.round(score));
}

function getDaysSinceCompliance(lastApproval: Approval | undefined): number | null {
  if (!lastApproval?.decidedAt) return null;
  const d = new Date(lastApproval.decidedAt);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

type BulkAction = "regression_eval" | "freeze_deployments" | "rotate_secrets" | "export_audit" | "delete";

const BULK_ACTION_META: Record<BulkAction, { label: string; description: string; icon: typeof Play; destructive?: boolean }> = {
  regression_eval: { label: "Run Regression Eval", description: "Trigger regression evaluation suites for the selected agents. This will run all bound eval suites and generate comparison reports.", icon: Play },
  freeze_deployments: { label: "Freeze Deployments", description: "Freeze all deployment pipelines for the selected agents. No new releases will be promoted until unfrozen.", icon: Pause },
  rotate_secrets: { label: "Rotate Secrets", description: "Initiate secret rotation for API keys and credentials used by the selected agents. Active sessions will be gracefully migrated.", icon: KeyRound },
  export_audit: { label: "Export Audit Bundle", description: "Generate and download a compliance audit bundle containing traces, evaluations, policy checks, and approval history for the selected agents.", icon: FileDown },
  delete: { label: "Delete Agents", description: "Permanently delete the selected agents and all associated data including API keys, channels, MCP server links, knowledge base links, and team memberships. This action cannot be undone.", icon: Trash2, destructive: true },
};

export default function Agents() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterEnv, setFilterEnv] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterAutonomy, setFilterAutonomy] = useState<string>("all");
  const [filterToolAccess, setFilterToolAccess] = useState<string>("all");
  const [filterCompliance, setFilterCompliance] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");

  const { toast } = useToast();
  const { role } = useRole();
  const { industry } = useIndustry();
  const blueprintPerm = usePermission("create_modify_blueprints");
  const auditPerm = usePermission("export_audit_bundle");
  const billingPerm = usePermission("billing_invoices");

  const canSeeHealth = role.id === "admin" || role.id === "ops_sre" || role.id === "agent_engineer" || role.id === "expert_validator" || role.id === "compliance_security";
  const canSeeCostRevenue = role.id === "admin" || role.id === "finance" || role.id === "outcome_owner";
  const canSeeIncidents = role.id === "admin" || role.id === "ops_sre" || role.id === "agent_engineer" || role.id === "expert_validator";

  const { data: agents, isLoading, error, refetch } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });
  const { data: outcomes } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
  });
  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, agentIds }: { action: BulkAction; agentIds: string[] }) => {
      return apiRequest("POST", "/api/agents/bulk-action", { action, agentIds });
    },
    onSuccess: () => {
      toast({ title: "Bulk action initiated", description: `${BULK_ACTION_META[bulkAction!]?.label} started for ${selectedIds.size} agent(s).` });
      setSelectedIds(new Set());
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk action failed", description: err.message, variant: "destructive" });
    },
  });

  const hasActiveFilters = filterOutcome !== "all" || filterEnv !== "all" || filterRisk !== "all" || filterAutonomy !== "all" || filterToolAccess !== "all" || filterCompliance !== "all" || filterProvider !== "all";

  const allComplianceTags = agents
    ? Array.from(new Set(agents.flatMap(a => (a.complianceTags as string[]) || []))).sort()
    : [];
  const allProviders = agents
    ? Array.from(new Set(agents.map(a => a.modelProvider).filter(Boolean))).sort()
    : [];

  const filtered = agents?.filter((a) => {
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterOutcome !== "all" && a.outcomeId !== filterOutcome) return false;
    if (filterEnv !== "all" && a.environment !== filterEnv) return false;
    if (filterRisk !== "all" && a.riskTier !== filterRisk) return false;
    if (filterAutonomy !== "all" && a.autonomyMode !== filterAutonomy) return false;
    if (filterToolAccess !== "all" && a.toolAccessClass !== filterToolAccess) return false;
    if (filterCompliance !== "all") {
      const tags = (a.complianceTags as string[]) || [];
      if (!tags.includes(filterCompliance)) return false;
    }
    if (filterProvider !== "all" && a.modelProvider !== filterProvider) return false;
    return true;
  });

  function getLastApproval(agentId: string): Approval | undefined {
    if (!approvals) return undefined;
    const agentApprovals = approvals
      .filter(a => a.objectId === agentId)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return agentApprovals[0];
  }

  const sorted = useMemo(() => {
    if (!filtered) return filtered;
    const arr = [...filtered];
    switch (sortBy) {
      case "revenue":
        arr.sort((a, b) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0));
        break;
      case "margin":
        arr.sort((a, b) => ((b.monthlyRevenue || 0) - (b.monthlyCost || 0)) - ((a.monthlyRevenue || 0) - (a.monthlyCost || 0)));
        break;
      case "roi": {
        const roiVal = (ag: Agent) => {
          const cost = ag.monthlyCost || 0;
          if (cost === 0) return 0;
          return ((ag.monthlyRevenue || 0) - cost) / cost * 100;
        };
        arr.sort((a, b) => roiVal(b) - roiVal(a));
        break;
      }
      case "health":
        arr.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));
        break;
      case "safety": {
        arr.sort((a, b) => {
          const safetyA = computeSafetyScore(a, getLastApproval(a.id));
          const safetyB = computeSafetyScore(b, getLastApproval(b.id));
          return safetyB - safetyA;
        });
        break;
      }
      case "recent":
        arr.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return dateB - dateA;
        });
        break;
      case "name":
      default:
        arr.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return arr;
  }, [filtered, sortBy, approvals]);

  function clearFilters() {
    setFilterOutcome("all");
    setFilterEnv("all");
    setFilterRisk("all");
    setFilterAutonomy("all");
    setFilterToolAccess("all");
    setFilterCompliance("all");
    setFilterProvider("all");
  }

  function toggleSelectAll() {
    if (!filtered) return;
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(a => a.id)));
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function formatTimeAgo(dateStr: string | Date | null | undefined): string {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  }

  const totalCost = agents?.reduce((sum, a) => sum + (a.monthlyCost || 0), 0) || 0;
  const totalRevenue = agents?.reduce((sum, a) => sum + (a.monthlyRevenue || 0), 0) || 0;
  const avgSuccess = agents?.length
    ? (agents.reduce((sum, a) => sum + (a.successRate || 0), 0) / agents.length * 100).toFixed(1)
    : "0";

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

  if (error) return <ErrorState message="Failed to load agents" onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6 p-6 min-w-0 w-full" data-testid="page-agents">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            System of record for all AI agents across your organization
          </p>
        </div>
        {!blueprintPerm.allowed ? (
          <Button disabled title="You do not have permission to design agents" data-testid="button-create-agent">
            <Plus className="w-4 h-4 mr-1.5" /> Design New Agent
          </Button>
        ) : (
          <Link href="/agents/wizard">
            <Button data-testid="button-create-agent">
              <Plus className="w-4 h-4 mr-1.5" /> Design New Agent
              {blueprintPerm.permission.access === "conditional" && blueprintPerm.permission.annotation && (
                <Badge variant="secondary" className="text-[10px] ml-1">{blueprintPerm.permission.annotation}</Badge>
              )}
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-total-agents" />
        <StatCard title="Teams" value={agents?.filter(a => a.agentType === "team")?.length || 0} icon={Users} variant="default" testId="stat-teams" />
        <StatCard title="Remote (A2A)" value={agents?.filter(a => a.agentType === "remote")?.length || 0} icon={Globe} variant="default" testId="stat-remote" />
        <StatCard title="Avg Success Rate" value={`${avgSuccess}%`} icon={Activity} trend="up" trendValue="1.2%" variant="success" testId="stat-avg-success" />
        <StatCard title="Monthly Cost" value={`$${totalCost.toLocaleString()}`} icon={DollarSign} variant="default" subtitle={`Revenue: $${totalRevenue.toLocaleString()}`} testId="stat-monthly-cost" />
      </div>

      <div className="flex items-center gap-1 border-b" data-testid="registry-tabs">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-primary" data-testid="tab-agents">
            <Bot className="w-3.5 h-3.5 mr-1.5" /> All Agents
          </Button>
        </Link>
        <Link href="/agents/teams">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-teams">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Teams
          </Button>
        </Link>
        <Link href="/agents/remote">
          <Button variant="ghost" size="sm" className="rounded-none border-b-2 border-transparent text-muted-foreground" data-testid="tab-remote">
            <Globe className="w-3.5 h-3.5 mr-1.5" /> Remote Agents (A2A)
          </Button>
        </Link>
      </div>

      <OutcomeKpiStrip />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-agents"
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
          <SelectTrigger className="w-[150px]" data-testid="sort-by">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recent</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="margin">Margin</SelectItem>
            <SelectItem value="roi">ROI</SelectItem>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="safety">Safety</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterOutcome} onValueChange={setFilterOutcome}>
          <SelectTrigger className="w-[160px]" data-testid="filter-outcome">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            {outcomes?.map(o => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterEnv} onValueChange={setFilterEnv}>
          <SelectTrigger className="w-[140px]" data-testid="filter-environment">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Envs</SelectItem>
            <SelectItem value="staging">Staging</SelectItem>
            <SelectItem value="pilot">Pilot</SelectItem>
            <SelectItem value="prod">Production</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-[130px]" data-testid="filter-risk">
            <SelectValue placeholder="Risk Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAutonomy} onValueChange={setFilterAutonomy}>
          <SelectTrigger className="w-[150px]" data-testid="filter-autonomy">
            <SelectValue placeholder="Autonomy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="autonomous">Autonomous</SelectItem>
            <SelectItem value="supervised">Supervised</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="shadow">Shadow</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterToolAccess} onValueChange={setFilterToolAccess}>
          <SelectTrigger className="w-[150px]" data-testid="filter-tool-access">
            <SelectValue placeholder="Tool Access" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Access</SelectItem>
            <SelectItem value="read_only">Read Only</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="privileged">Privileged</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterCompliance} onValueChange={setFilterCompliance}>
          <SelectTrigger className="w-[160px]" data-testid="filter-compliance">
            <SelectValue placeholder="Compliance" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tags</SelectItem>
            {allComplianceTags.map(tag => (
              <SelectItem key={tag} value={tag}>{tag}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="w-[140px]" data-testid="filter-provider">
            <SelectValue placeholder="Provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {allProviders.map(p => (
              <SelectItem key={p!} value={p!}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
            <X className="w-3.5 h-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-md bg-primary/5 border border-primary/10 flex-wrap" data-testid="bulk-action-bar">
          <span className="text-sm font-medium">{selectedIds.size} agent{selectedIds.size > 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setBulkAction("regression_eval")} data-testid="bulk-regression-eval">
              <Play className="w-3.5 h-3.5 mr-1" /> Run Regression Eval
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkAction("freeze_deployments")} data-testid="bulk-freeze-deployments">
              <Pause className="w-3.5 h-3.5 mr-1" /> Freeze Deployments
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkAction("rotate_secrets")} data-testid="bulk-rotate-secrets">
              <KeyRound className="w-3.5 h-3.5 mr-1" /> Rotate Secrets
            </Button>
            {!auditPerm.allowed ? (
              <Button variant="outline" size="sm" disabled title="You do not have permission to export audit bundles" data-testid="bulk-export-audit">
                <FileDown className="w-3.5 h-3.5 mr-1" /> Export Audit Bundle
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setBulkAction("export_audit")} data-testid="bulk-export-audit">
                <FileDown className="w-3.5 h-3.5 mr-1" /> Export Audit Bundle
                {auditPerm.permission.access === "conditional" && auditPerm.permission.annotation && (
                  <Badge variant="secondary" className="text-[10px] ml-1">{auditPerm.permission.annotation}</Badge>
                )}
              </Button>
            )}
            {blueprintPerm.allowed && (
              <Button variant="outline" size="sm" className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => setBulkAction("delete")} data-testid="bulk-delete-agents">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} data-testid="button-deselect-all">
              <X className="w-3.5 h-3.5 mr-1" /> Deselect
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered && filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Industry Profile</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Version</TableHead>
                {canSeeHealth && <TableHead>Health</TableHead>}
                {canSeeHealth && <TableHead>Safety Score</TableHead>}
                <TableHead>Mode</TableHead>
                {canSeeIncidents && <TableHead>Last Incident / Approval</TableHead>}
                {canSeeCostRevenue && <TableHead className="text-right">P&L</TableHead>}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted?.map((agent) => {
                const outcome = outcomes?.find((o) => o.id === agent.outcomeId);
                const lastApproval = getLastApproval(agent.id);
                const healthColor = (agent.healthScore || 0) >= 90 ? "text-emerald-600 dark:text-emerald-400" : (agent.healthScore || 0) >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
                const domain = getIndustryDomain(agent);
                const euRisk = EU_AI_ACT_MAP[agent.riskTier] || EU_AI_ACT_MAP["MEDIUM"];
                const compTags = (agent.complianceTags as string[]) || [];
                const shownTags = compTags.slice(0, 3);
                const extraTags = compTags.length - 3;
                const ontologyCount = getOntologyCount(agent);
                const revenue = agent.monthlyRevenue || 0;
                const cost = agent.monthlyCost || 0;
                const margin = revenue - cost;
                const roi = cost > 0 ? ((revenue - cost) / cost * 100) : 0;
                const marginColor = margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
                const pipeline = getPipelineStatus(agent);
                const evalCov = getEvalCoverage(agent);
                const safetyScore = computeSafetyScore(agent, lastApproval);
                const daysSinceComp = getDaysSinceCompliance(lastApproval);
                const safetyColor = safetyScore >= 80 ? "text-emerald-600 dark:text-emerald-400" : safetyScore >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

                return (
                  <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`} className={selectedIds.has(agent.id) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(agent.id)}
                        onCheckedChange={() => toggleSelect(agent.id)}
                        data-testid={`checkbox-agent-${agent.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/agents/${agent.id}`}>
                        <div className="flex items-center gap-2.5 cursor-pointer" data-testid={`link-agent-${agent.id}`}>
                          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                            {agent.agentType === "team" ? <Users className="w-3.5 h-3.5 text-primary" /> :
                             agent.agentType === "remote" ? <Globe className="w-3.5 h-3.5 text-primary" /> :
                             <Bot className="w-3.5 h-3.5 text-primary" />}
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium hover:underline">{agent.name}</span>
                              {agent.agentType === "team" && (
                                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20">Team</Badge>
                              )}
                              {agent.agentType === "remote" && (
                                <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20">A2A</Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{agent.owner || "Unassigned"}</span>
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell data-testid={`industry-profile-${agent.id}`}>
                      <div className="flex flex-col gap-1 max-w-[180px]">
                        <Badge variant="outline" className="text-[10px] w-fit bg-primary/5 border-primary/15">{domain}</Badge>
                        <Badge variant="outline" className={`text-[10px] w-fit border ${euRisk.className}`} data-testid={`eu-risk-${agent.id}`}>{euRisk.label}</Badge>
                        {shownTags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap" data-testid={`compliance-tags-${agent.id}`}>
                            {shownTags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                            ))}
                            {extraTags > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[10px] text-muted-foreground cursor-default" data-testid={`compliance-more-${agent.id}`}>+{extraTags} more</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="flex flex-col gap-0.5">
                                    {compTags.slice(3).map(t => (
                                      <span key={t} className="text-xs">{t}</span>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                        {ontologyCount > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`ontology-count-${agent.id}`}>
                            <Network className="w-3 h-3" /> KG: {ontologyCount} domain{ontologyCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{outcome?.name || "\u2014"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">v{agent.currentVersion}</Badge>
                    </TableCell>
                    {canSeeHealth && (
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 cursor-pointer" data-testid={`health-detail-${agent.id}`}>
                              <Progress value={agent.healthScore || 0} className="h-1.5 w-16" />
                              <span className={`text-xs font-medium ${healthColor}`}>{agent.healthScore}%</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3" align="start">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-medium">Health Breakdown</span>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Success</span>
                                  <span className="text-[11px] font-medium">{((agent.successRate || 0) * 100).toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Latency</span>
                                  <span className="text-[11px] font-medium">{agent.avgLatencyMs}ms</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Cost/Run</span>
                                  <span className="text-[11px] font-medium">${agent.costPerRun?.toFixed(3)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Shield className="w-3 h-3" /> Policy</span>
                                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Compliant</span>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    )}
                    {canSeeHealth && (
                      <TableCell data-testid={`safety-score-${agent.id}`}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 cursor-pointer" data-testid={`safety-detail-${agent.id}`}>
                              <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
                                <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
                                  <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                                  <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3" strokeDasharray={`${safetyScore * 0.88} 88`} strokeLinecap="round" className={safetyScore >= 80 ? "stroke-emerald-500" : safetyScore >= 50 ? "stroke-amber-500" : "stroke-red-500"} />
                                </svg>
                                <span className={`absolute text-[9px] font-semibold ${safetyColor}`}>{safetyScore}</span>
                              </div>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3" align="start">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-medium">Safety Score Breakdown</span>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    {pipeline === "passed" ? <CheckCircle className="w-3 h-3 text-emerald-500" /> : pipeline === "partial" ? <CircleDot className="w-3 h-3 text-amber-500" /> : <Minus className="w-3 h-3 text-muted-foreground" />}
                                    Pipeline
                                  </span>
                                  <span className="text-[11px] font-medium">{pipeline === "passed" ? "Passed" : pipeline === "partial" ? "Partial" : "None"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground">Eval Coverage</span>
                                  <div className="flex items-center gap-1.5">
                                    <Progress value={evalCov} className="h-1 w-10" />
                                    <span className="text-[11px] font-medium">{evalCov}%</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground">Since Compliance</span>
                                  <span className="text-[11px] font-medium">{daysSinceComp !== null ? `${daysSinceComp}d` : "N/A"}</span>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    )}
                    <TableCell>
                      <StatusBadge status={agent.autonomyMode} />
                    </TableCell>
                    {canSeeIncidents && (
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {agent.lastIncidentAt ? (
                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                            ) : (
                              <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                            )}
                            <span className="text-[11px] text-muted-foreground">
                              {agent.lastIncidentAt ? formatTimeAgo(agent.lastIncidentAt) : "No incidents"}
                            </span>
                          </div>
                          {lastApproval && (
                            <div className="flex items-center gap-1.5">
                              <Shield className="w-3 h-3 text-muted-foreground shrink-0" />
                              <span className="text-[11px] text-muted-foreground">
                                {lastApproval.type.replace(/_/g, " ")} ({lastApproval.status})
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {canSeeCostRevenue && (
                      <TableCell className="text-right" data-testid={`pnl-${agent.id}`}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex flex-col items-end gap-0.5 cursor-pointer" data-testid={`pnl-detail-${agent.id}`}>
                              <span className={`text-sm font-medium ${marginColor}`}>
                                {margin >= 0 ? "+" : ""}${Math.abs(margin).toLocaleString()}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                ROI: <span className={marginColor}>{roi.toFixed(0)}%</span>
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-3" align="end">
                            <div className="flex flex-col gap-2">
                              <span className="text-xs font-medium">P&L Details</span>
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Revenue</span>
                                  <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">${revenue.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Cost</span>
                                  <span className="text-[11px] font-medium">${cost.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground">Margin</span>
                                  <span className={`text-[11px] font-medium ${marginColor}`}>{margin >= 0 ? "+" : ""}${Math.abs(margin).toLocaleString()}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground">ROI</span>
                                  <span className={`text-[11px] font-medium ${marginColor}`}>{roi.toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-muted-foreground">Cost/Run</span>
                                  <span className="text-[11px] font-medium">${agent.costPerRun?.toFixed(3)}</span>
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link href={`/agents/${agent.id}?export=1`}>
                              <Button variant="ghost" size="icon" data-testid={`button-export-agent-${agent.id}`}>
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>Export as Code</TooltipContent>
                        </Tooltip>
                        <Link href={`/agents/${agent.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-agent-${agent.id}`}>
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered?.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Bot className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No agents found</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={bulkAction !== null} onOpenChange={(open) => { if (!open) setBulkAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="bulk-dialog-title">
              {bulkAction && BULK_ACTION_META[bulkAction]?.label}
            </DialogTitle>
            <DialogDescription>
              {bulkAction && BULK_ACTION_META[bulkAction]?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <span className="text-sm font-medium">{selectedIds.size} agent{selectedIds.size > 1 ? "s" : ""} selected:</span>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedIds).map(id => {
                const agent = agents?.find(a => a.id === id);
                return (
                  <Badge key={id} variant="outline" className="text-[11px]">
                    {agent?.name || id}
                  </Badge>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)} data-testid="button-cancel-bulk">Cancel</Button>
            <Button
              variant={bulkAction && BULK_ACTION_META[bulkAction]?.destructive ? "destructive" : "default"}
              onClick={() => {
                if (bulkAction) {
                  bulkActionMutation.mutate({ action: bulkAction, agentIds: Array.from(selectedIds) });
                }
              }}
              disabled={bulkActionMutation.isPending}
              data-testid="button-confirm-bulk"
            >
              {bulkActionMutation.isPending ? "Processing..." : bulkAction === "delete" ? "Delete Permanently" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
