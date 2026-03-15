import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Agent, Blueprint } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  GitBranch, Search, Plus, Bot, CheckCircle, FileCode, Pencil,
  Copy, ArrowRight, Shield, AlertTriangle, Crown, Users, Brain,
  Wrench, Database, Split, UserCheck, Network, Lock,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BlueprintWithCount = Blueprint & { agentCount?: number };

const PATTERN_TYPES = [
  { value: "rag_pipeline", label: "RAG Pipeline" },
  { value: "orchestrator", label: "Orchestrator" },
  { value: "fan_out", label: "Fan-out" },
  { value: "linear_chain", label: "Linear Chain" },
  { value: "human_in_loop", label: "Human-in-Loop" },
  { value: "custom", label: "Custom" },
] as const;

const NODE_ICON_MAP: Record<string, typeof Brain> = {
  llm_call: Brain, tool_call: Wrench, rag: Database, classifier: GitBranch,
  router: Split, human_review: UserCheck, schema_validate: Shield,
};

const NODE_LABEL_MAP: Record<string, string> = {
  llm_call: "LLM", tool_call: "Tool", rag: "RAG", classifier: "Classify",
  router: "Router", human_review: "Review", schema_validate: "Validate",
};

const NODE_COLOR_MAP: Record<string, string> = {
  llm_call: "text-blue-500", tool_call: "text-amber-500", rag: "text-purple-500",
  classifier: "text-cyan-500", router: "text-emerald-500", human_review: "text-orange-500",
  schema_validate: "text-gray-500",
};

function getNodeFlowSummary(blueprintJson: any): { count: number; types: string[] } | null {
  if (!blueprintJson || !blueprintJson.nodes || !Array.isArray(blueprintJson.nodes) || blueprintJson.nodes.length === 0) return null;
  const types = blueprintJson.nodes.map((n: any) => n.type).filter(Boolean);
  return { count: types.length, types };
}

function getValidationHealth(validationResults: any): { status: "passed" | "warning" | "failed" | "unvalidated"; label: string } {
  if (!validationResults) return { status: "unvalidated", label: "Not Validated" };
  const vr = validationResults as any;
  if (vr.passed === true && (!vr.warnings || vr.warnings.length === 0)) return { status: "passed", label: "Passed" };
  if (vr.passed === true && vr.warnings && vr.warnings.length > 0) return { status: "warning", label: `${vr.warnings.length} Warning${vr.warnings.length !== 1 ? "s" : ""}` };
  return { status: "failed", label: `${vr.errors?.length || 0} Error${(vr.errors?.length || 0) !== 1 ? "s" : ""}` };
}

const HEALTH_STYLES: Record<string, string> = {
  passed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  failed: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
  unvalidated: "bg-muted text-muted-foreground border-border",
};

const HEALTH_ICON: Record<string, typeof CheckCircle> = {
  passed: CheckCircle,
  warning: AlertTriangle,
  failed: AlertTriangle,
  unvalidated: Shield,
};

function NodeFlowChain({ types }: { types: string[] }) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {types.map((type, i) => {
        const Icon = NODE_ICON_MAP[type] || GitBranch;
        const color = NODE_COLOR_MAP[type] || "text-muted-foreground";
        const label = NODE_LABEL_MAP[type] || type;
        return (
          <div key={i} className="flex items-center gap-0.5">
            {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-0.5">
                  <Icon className={`w-3 h-3 ${color} shrink-0`} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
}

function StatusBadgeForBlueprint({ status }: { status: string }) {
  if (status === "compiled") {
    return <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px]" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
  if (status === "signed") {
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]" data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
  return <Badge variant="default" className="text-[10px]" data-testid={`badge-status-${status}`}>{status}</Badge>;
}

export default function Blueprints() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [patternFilter, setPatternFilter] = useState("all");
  const [sharedFilter, setSharedFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newPatternType, setNewPatternType] = useState("");
  const [createFromAgent, setCreateFromAgent] = useState(false);

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: blueprints, isLoading: blueprintsLoading } = useQuery<BlueprintWithCount[]>({ queryKey: ["/api/blueprints"] });
  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const isLoading = blueprintsLoading || agentsLoading;

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    agents?.forEach((a) => m.set(a.id, a));
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    if (!blueprints) return [];
    return blueprints.filter((b) => {
      if (searchQuery && !b.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(b.description || "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (patternFilter !== "all" && b.patternType !== patternFilter) return false;
      if (sharedFilter === "shared" && !b.isShared) return false;
      if (sharedFilter === "personal" && b.isShared) return false;
      return true;
    });
  }, [blueprints, searchQuery, statusFilter, patternFilter, sharedFilter]);

  const stats = useMemo(() => {
    if (!blueprints) return { total: 0, signed: 0, draft: 0, compiled: 0, shared: 0 };
    return {
      total: blueprints.length,
      signed: blueprints.filter((b) => b.status === "signed").length,
      draft: blueprints.filter((b) => b.status === "draft").length,
      compiled: blueprints.filter((b) => b.status === "compiled").length,
      shared: blueprints.filter((b) => b.isShared).length,
    };
  }, [blueprints]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; agentId?: string; blueprintJson?: unknown; patternType?: string }) => {
      const res = await apiRequest("POST", "/api/blueprints", data);
      return res.json();
    },
    onSuccess: (blueprint: Blueprint) => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      toast({ title: "Blueprint created", description: `"${blueprint.name}" has been created.` });
      resetDialog();
      setLocation(`/blueprints/${blueprint.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create blueprint", description: err.message, variant: "destructive" });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/blueprints/${id}/clone`);
      return res.json();
    },
    onSuccess: (blueprint: Blueprint) => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      toast({ title: "Blueprint cloned", description: `"${blueprint.name}" has been created as a fork.` });
      setLocation(`/blueprints/${blueprint.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to clone", description: err.message, variant: "destructive" });
    },
  });

  function resetDialog() {
    setDialogOpen(false);
    setNewName("");
    setNewDescription("");
    setNewAgentId("");
    setNewPatternType("");
    setCreateFromAgent(false);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const data: { name: string; description?: string; agentId?: string; blueprintJson?: unknown; patternType?: string } = {
      name: newName.trim(),
    };
    if (newDescription.trim()) data.description = newDescription.trim();
    if (newAgentId) data.agentId = newAgentId;
    if (newPatternType) data.patternType = newPatternType;
    if (createFromAgent && newAgentId) {
      const agent = agentMap.get(newAgentId);
      if (agent?.blueprintJson) {
        data.blueprintJson = agent.blueprintJson;
      }
    }
    createMutation.mutate(data);
  }

  const selectedAgent = newAgentId ? agentMap.get(newAgentId) : null;

  if (isLoading) return (
    <div className="flex flex-col gap-6 p-6 w-full" data-testid="page-blueprints-loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-32 w-full" /></CardContent></Card>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 p-6 w-full" data-testid="page-blueprints">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <GitBranch className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">Blueprint Studio</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">Design, validate, and version agent workflows</p>
          </div>
        </div>
        <Button onClick={() => setDialogOpen(true)} data-testid="button-new-blueprint">
          <Plus className="w-4 h-4 mr-1.5" /> New Blueprint
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="stats-bar">
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <GitBranch className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-total-blueprints">{stats.total}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-muted-foreground">Signed</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-signed">{stats.signed}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <Pencil className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Draft</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-draft">{stats.draft}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <FileCode className="w-3 h-3 text-blue-500" />
            <span className="text-xs text-muted-foreground">Compiled</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-compiled">{stats.compiled}</span>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <Crown className="w-3 h-3 text-amber-500" />
            <span className="text-xs text-muted-foreground">Shared</span>
          </div>
          <span className="text-2xl font-semibold" data-testid="stat-shared">{stats.shared}</span>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap" data-testid="filter-bar">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search blueprints..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="compiled">Compiled</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={patternFilter} onValueChange={setPatternFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-pattern-filter">
            <SelectValue placeholder="Pattern" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Patterns</SelectItem>
            {PATTERN_TYPES.map(pt => (
              <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sharedFilter} onValueChange={setSharedFilter}>
          <SelectTrigger className="w-[130px]" data-testid="select-shared-filter">
            <SelectValue placeholder="Visibility" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="shared">Shared</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <GitBranch className="w-10 h-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground" data-testid="text-empty-state">No blueprints found</p>
            <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-create">
              <Plus className="w-4 h-4 mr-1.5" /> Create Blueprint
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="blueprint-grid">
          {filtered.map((bp) => {
            const agent = bp.agentId ? agentMap.get(bp.agentId) : null;
            const flow = getNodeFlowSummary(bp.blueprintJson);
            const health = getValidationHealth(bp.validationResults);
            const HealthIcon = HEALTH_ICON[health.status];
            const patternLabel = PATTERN_TYPES.find(pt => pt.value === bp.patternType)?.label;

            return (
              <Card key={bp.id} className="group hover:border-primary/30 transition-colors" data-testid={`card-blueprint-${bp.id}`}>
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/blueprints/${bp.id}`}>
                      <div className="flex items-center gap-2.5 cursor-pointer min-w-0" data-testid={`link-blueprint-${bp.id}`}>
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 shrink-0">
                          <GitBranch className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium hover:underline truncate" data-testid={`text-blueprint-name-${bp.id}`}>{bp.name}</span>
                            {bp.isShared && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Crown className="w-3 h-3 text-amber-500 shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Shared to org</TooltipContent>
                              </Tooltip>
                            )}
                            {bp.forkedFromId && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Copy className="w-3 h-3 text-muted-foreground shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">Forked from another blueprint</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          {bp.description && (
                            <span className="text-[11px] text-muted-foreground truncate">{bp.description}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <StatusBadgeForBlueprint status={bp.status} />
                      <Badge variant="outline" className="text-[10px]" data-testid={`text-version-${bp.id}`}>v{bp.version}</Badge>
                    </div>
                  </div>

                  {flow && (
                    <div className="flex flex-col gap-1 px-1">
                      <span className="text-[10px] text-muted-foreground font-medium">{flow.count} node{flow.count !== 1 ? "s" : ""}</span>
                      <NodeFlowChain types={flow.types} />
                    </div>
                  )}

                  {!flow && (
                    <div className="flex items-center gap-1.5 px-1 py-2">
                      <GitBranch className="w-3.5 h-3.5 text-muted-foreground/40" />
                      <span className="text-[11px] text-muted-foreground/60 italic">No nodes yet</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${HEALTH_STYLES[health.status]}`} data-testid={`badge-health-${bp.id}`}>
                      <HealthIcon className="w-2.5 h-2.5 mr-0.5" />
                      {health.label}
                    </Badge>
                    {patternLabel && (
                      <Badge variant="outline" className="text-[10px] bg-primary/5 border-primary/20" data-testid={`badge-pattern-${bp.id}`}>
                        <Network className="w-2.5 h-2.5 mr-0.5" />
                        {patternLabel}
                      </Badge>
                    )}
                    {agent && (
                      <Badge variant="outline" className="text-[10px]" data-testid={`badge-agent-${bp.id}`}>
                        <Bot className="w-2.5 h-2.5 mr-0.5" />
                        {agent.name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-usage-${bp.id}`}>
                      <Users className="w-2.5 h-2.5 mr-0.5" />
                      {bp.agentCount || 0} agent{(bp.agentCount || 0) !== 1 ? "s" : ""}
                    </Badge>
                    {!bp.isShared && (
                      <Badge variant="outline" className="text-[10px] bg-muted/50" data-testid={`badge-personal-${bp.id}`}>
                        <Lock className="w-2.5 h-2.5 mr-0.5" />
                        Personal
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); cloneMutation.mutate(bp.id); }}
                      disabled={cloneMutation.isPending}
                      data-testid={`button-clone-${bp.id}`}
                    >
                      <Copy className="w-3 h-3 mr-1" /> Clone
                    </Button>
                    <Link href={`/blueprints/${bp.id}`}>
                      <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-open-${bp.id}`}>
                        Open
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">New Blueprint</DialogTitle>
            <DialogDescription>Create a new agent workflow blueprint.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input
                placeholder="e.g. Customer Support Flow"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-blueprint-name"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                placeholder="Optional description..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                data-testid="input-blueprint-description"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Pattern Type</label>
              <Select value={newPatternType || "none"} onValueChange={(v) => setNewPatternType(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-blueprint-pattern">
                  <SelectValue placeholder="Select pattern (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No pattern</SelectItem>
                  {PATTERN_TYPES.map(pt => (
                    <SelectItem key={pt.value} value={pt.value}>{pt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Linked Agent</label>
              <Select value={newAgentId || "none"} onValueChange={(v) => { setNewAgentId(v === "none" ? "" : v); if (v === "none") setCreateFromAgent(false); }}>
                <SelectTrigger data-testid="select-blueprint-agent">
                  <SelectValue placeholder="Select an agent (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No agent</SelectItem>
                  {agents?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedAgent && !!selectedAgent.blueprintJson && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create-from-agent"
                  checked={createFromAgent}
                  onCheckedChange={(checked) => setCreateFromAgent(!!checked)}
                  data-testid="checkbox-create-from-agent"
                />
                <label htmlFor="create-from-agent" className="text-sm cursor-pointer">
                  Import existing blueprint from agent
                </label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDialog} data-testid="button-cancel-create">Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-submit-create"
            >
              {createMutation.isPending ? "Creating..." : "Create Blueprint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
