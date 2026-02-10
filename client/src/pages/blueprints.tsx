import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { Agent, Blueprint } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GitBranch, Search, Plus, Bot, CheckCircle, FileCode, Clock, Pencil,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatDate(date: string | Date | null | undefined) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusBadgeForBlueprint({ status }: { status: string }) {
  if (status === "compiled") {
    return (
      <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  }
  if (status === "signed") {
    return (
      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-status-${status}`}>
        {status}
      </Badge>
    );
  }
  return (
    <Badge variant="default" data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
  );
}

export default function Blueprints() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [createFromAgent, setCreateFromAgent] = useState(false);

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: blueprints, isLoading: blueprintsLoading } = useQuery<Blueprint[]>({ queryKey: ["/api/blueprints"] });
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
      if (searchQuery && !b.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (agentFilter !== "all" && b.agentId !== agentFilter) return false;
      return true;
    });
  }, [blueprints, searchQuery, statusFilter, agentFilter]);

  const stats = useMemo(() => {
    if (!blueprints) return { total: 0, signed: 0, draft: 0, compiled: 0 };
    return {
      total: blueprints.length,
      signed: blueprints.filter((b) => b.status === "signed").length,
      draft: blueprints.filter((b) => b.status === "draft").length,
      compiled: blueprints.filter((b) => b.status === "compiled").length,
    };
  }, [blueprints]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; agentId?: string; blueprintJson?: unknown }) => {
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

  function resetDialog() {
    setDialogOpen(false);
    setNewName("");
    setNewDescription("");
    setNewAgentId("");
    setCreateFromAgent(false);
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const data: { name: string; description?: string; agentId?: string; blueprintJson?: unknown } = {
      name: newName.trim(),
    };
    if (newDescription.trim()) data.description = newDescription.trim();
    if (newAgentId) data.agentId = newAgentId;
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="stats-bar">
        <Card><CardContent className="p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            <GitBranch className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total Blueprints</span>
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
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="compiled">Compiled</SelectItem>
            <SelectItem value="signed">Signed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-agent-filter">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agents?.map((a) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
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
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Linked Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last Eval</TableHead>
                  <TableHead>Last Deploy</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((bp) => {
                  const agent = bp.agentId ? agentMap.get(bp.agentId) : null;
                  return (
                    <TableRow key={bp.id} className="cursor-pointer" data-testid={`row-blueprint-${bp.id}`}>
                      <TableCell>
                        <Link href={`/blueprints/${bp.id}`}>
                          <div className="flex items-center gap-2.5 cursor-pointer" data-testid={`link-blueprint-${bp.id}`}>
                            <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary/10 shrink-0">
                              <GitBranch className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium hover:underline" data-testid={`text-blueprint-name-${bp.id}`}>{bp.name}</span>
                              {bp.description && (
                                <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{bp.description}</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {agent ? (
                          <div className="flex items-center gap-1.5" data-testid={`text-agent-${bp.id}`}>
                            <Bot className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{agent.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">{"\u2014"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadgeForBlueprint status={bp.status} />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]" data-testid={`text-version-${bp.id}`}>v{bp.version}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span data-testid={`text-last-eval-${bp.id}`}>{formatDate(bp.lastEvalAt) || "Never"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span data-testid={`text-last-deploy-${bp.id}`}>{formatDate(bp.lastDeployAt) || "Never"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground" data-testid={`text-created-${bp.id}`}>
                          {formatDate(bp.createdAt) || "\u2014"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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
