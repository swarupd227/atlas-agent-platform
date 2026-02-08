import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
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
import { StatCard } from "@/components/stat-card";
import { OutcomeKpiStrip } from "@/components/outcome-kpi-strip";
import { StatusBadge } from "@/components/status-badge";
import { ErrorState } from "@/components/error-state";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Agent, OutcomeContract, Approval } from "@shared/schema";

type BulkAction = "regression_eval" | "freeze_deployments" | "rotate_secrets" | "export_audit";

const BULK_ACTION_META: Record<BulkAction, { label: string; description: string; icon: typeof Play }> = {
  regression_eval: { label: "Run Regression Eval", description: "Trigger regression evaluation suites for the selected agents. This will run all bound eval suites and generate comparison reports.", icon: Play },
  freeze_deployments: { label: "Freeze Deployments", description: "Freeze all deployment pipelines for the selected agents. No new releases will be promoted until unfrozen.", icon: Pause },
  rotate_secrets: { label: "Rotate Secrets", description: "Initiate secret rotation for API keys and credentials used by the selected agents. Active sessions will be gracefully migrated.", icon: KeyRound },
  export_audit: { label: "Export Audit Bundle", description: "Generate and download a compliance audit bundle containing traces, evaluations, policy checks, and approval history for the selected agents.", icon: FileDown },
};

export default function Agents() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterEnv, setFilterEnv] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [filterToolAccess, setFilterToolAccess] = useState<string>("all");
  const [filterCompliance, setFilterCompliance] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");

  const { toast } = useToast();

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

  const hasActiveFilters = filterOutcome !== "all" || filterEnv !== "all" || filterRisk !== "all" || filterToolAccess !== "all" || filterCompliance !== "all" || filterProvider !== "all";

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

  function clearFilters() {
    setFilterOutcome("all");
    setFilterEnv("all");
    setFilterRisk("all");
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
    <div className="flex flex-col gap-6 p-6" data-testid="page-agents">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Agent Registry</h1>
          <p className="text-sm text-muted-foreground">
            System of record for all AI agents across your organization
          </p>
        </div>
        <Link href="/agents/wizard">
          <Button data-testid="button-create-agent">
            <Plus className="w-4 h-4 mr-1.5" /> Design New Agent
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Agents" value={agents?.length || 0} icon={Bot} variant="default" testId="stat-total-agents" />
        <StatCard title="Avg Success Rate" value={`${avgSuccess}%`} icon={Activity} trend="up" trendValue="1.2%" variant="success" testId="stat-avg-success" />
        <StatCard title="Monthly Cost" value={`$${totalCost.toLocaleString()}`} icon={DollarSign} variant="default" subtitle={`Revenue: $${totalRevenue.toLocaleString()}`} testId="stat-monthly-cost" />
        <StatCard title="Autonomous" value={agents?.filter((a) => a.autonomyMode === "autonomous")?.length || 0} icon={Zap} variant="default" subtitle="fully autonomous" testId="stat-autonomous" />
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
            <Button variant="outline" size="sm" onClick={() => setBulkAction("export_audit")} data-testid="bulk-export-audit">
              <FileDown className="w-3.5 h-3.5 mr-1" /> Export Audit Bundle
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} data-testid="button-deselect-all">
              <X className="w-3.5 h-3.5 mr-1" /> Deselect
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
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
                <TableHead>Outcome</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Last Incident / Approval</TableHead>
                <TableHead className="text-right">Monthly Cost / Revenue</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((agent) => {
                const outcome = outcomes?.find((o) => o.id === agent.outcomeId);
                const lastApproval = getLastApproval(agent.id);
                const healthColor = (agent.healthScore || 0) >= 90 ? "text-emerald-600 dark:text-emerald-400" : (agent.healthScore || 0) >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

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
                            <Bot className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium hover:underline">{agent.name}</span>
                            <span className="text-[11px] text-muted-foreground">{agent.owner || "Unassigned"}</span>
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{outcome?.name || "\u2014"}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">v{agent.currentVersion}</Badge>
                    </TableCell>
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
                    <TableCell>
                      <StatusBadge status={agent.autonomyMode} />
                    </TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm font-medium">${(agent.monthlyCost || 0).toLocaleString()}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {(agent.monthlyRevenue || 0) > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3" />${(agent.monthlyRevenue || 0).toLocaleString()}
                            </span>
                          ) : (
                            "\u2014"
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/agents/${agent.id}`}>
                        <Button variant="ghost" size="icon" data-testid={`button-view-agent-${agent.id}`}>
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                      </Link>
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
              onClick={() => {
                if (bulkAction) {
                  bulkActionMutation.mutate({ action: bulkAction, agentIds: Array.from(selectedIds) });
                }
              }}
              disabled={bulkActionMutation.isPending}
              data-testid="button-confirm-bulk"
            >
              {bulkActionMutation.isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
