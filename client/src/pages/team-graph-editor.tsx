import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { TeamBlueprintNode, TeamBlueprintEdge, Agent, RemoteAgent, Policy, DagStateSchema, Skill, KnowledgeBase, RuleLeaf, RuleGroup, RuleOperator, DagExecutionRun } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import TeamGraphCanvas from "@/components/team-graph-canvas";
import { NODE_COLOR_MAP, TRUST_TIER_COLORS } from "@/lib/team-graph-node-meta";
import {
  Brain, Wrench, ShieldCheck, Globe, Plus, X, Link2, MousePointer,
  FileText, Database, Type, Link as LinkIcon, Network, AlertTriangle, Eye,
  Save, Sparkles, Play, Loader2, CheckCircle2, XCircle, History, SquareFunction,
} from "lucide-react";

interface McpServerTool {
  id: string;
  serverId: string;
  name: string;
  description: string | null;
  inputSchema: any;
  outputSchema: any;
  riskClassification: string | null;
  enabled: boolean;
  annotations: any;
}

interface TeamGraphEditorProps {
  blueprintId: string;
  teamAgentId?: string;
  businessView?: boolean;
  processFlowSteps?: Array<{ label: string }>;
}

const RULE_OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: ">", label: "> greater than" },
  { value: "<", label: "< less than" },
  { value: ">=", label: ">= at least" },
  { value: "<=", label: "<= at most" },
  { value: "==", label: "== equals" },
  { value: "!=", label: "!= not equals" },
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "doesn't contain" },
];

// Sentence-form phrasing of the same operators, for the business-friendly
// "Simple" rule view -- same RuleOperator values, no symbols.
const RULE_OPERATOR_PHRASES: Record<RuleOperator, string> = {
  ">": "is more than",
  "<": "is less than",
  ">=": "is at least",
  "<=": "is at most",
  "==": "is",
  "!=": "is not",
  contains: "contains",
  not_contains: "doesn't contain",
};

const TEAM_NODE_TYPES = [
  { type: "internal_agent", label: "Internal Agent", icon: Brain, color: "bg-blue-500" },
  { type: "tool_set", label: "Tool Set", icon: Wrench, color: "bg-amber-500" },
  { type: "edge_gate", label: "Edge Gate", icon: ShieldCheck, color: "bg-orange-500" },
  { type: "remote_agent", label: "Remote Agent", icon: Globe, color: "bg-purple-500" },
  { type: "skill", label: "Skill", icon: Sparkles, color: "bg-teal-500" },
  { type: "knowledge_base", label: "Knowledge Base", icon: Database, color: "bg-emerald-500" },
  // Calls another of this org's own team flows end to end and waits for it
  // (executeTeamReferenceNode) -- the mechanism already existed as a hidden
  // "Team Reference" toggle buried inside Internal Agent; this makes it its
  // own discoverable node so a reviewer scanning the palette sees "one agent"
  // vs. "an entire other flow" as two different things, not a checkbox one
  // level down. Old internal_agent+refTeamAgentId nodes still work exactly
  // as before -- executeNode() dispatches on refTeamAgentId presence, not
  // nodeType, so nothing about existing blueprints needed to change.
  { type: "sub_flow", label: "Sub-Flow", icon: Network, color: "bg-indigo-500" },
  // Reshapes shared DAG state with a JSONata expression -- no LLM call, no
  // cost, near-instant. The lightweight alternative to a full internal_agent
  // node for "pull a few fields out and rename/recompute them" mid-flow.
  { type: "expression", label: "Expression", icon: SquareFunction, color: "bg-slate-500" },
] as const;

const PART_TYPE_OPTIONS = [
  { value: "text", label: "Text", icon: Type },
  { value: "url", label: "URL", icon: LinkIcon },
  { value: "data", label: "Data", icon: Database },
  { value: "file", label: "File", icon: FileText },
];


export default function TeamGraphEditor({ blueprintId, teamAgentId, businessView, processFlowSteps }: TeamGraphEditorProps) {
  const { toast } = useToast();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);

  const graphQueryKey = ["/api/blueprints", blueprintId, "team-graph"];

  const { data: graphData, isLoading } = useQuery<{ nodes: TeamBlueprintNode[]; edges: TeamBlueprintEdge[] }>({
    queryKey: graphQueryKey,
    enabled: !!blueprintId,
  });

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: remoteAgents } = useQuery<RemoteAgent[]>({ queryKey: ["/api/remote-agents"] });
  const { data: mcpTools } = useQuery<McpServerTool[]>({ queryKey: ["/api/mcp-tools"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });
  const { data: skills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const { data: knowledgeBases } = useQuery<KnowledgeBase[]>({ queryKey: ["/api/knowledge-bases"] });

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];

  const getNodeDisplayLabel = useCallback((node: TeamBlueprintNode) => {
    if (!businessView || !processFlowSteps?.length) return node.label;
    const idx = nodes.findIndex(n => n.id === node.id);
    if (idx >= 0 && processFlowSteps[idx]?.label) return processFlowSteps[idx].label;
    return node.label;
  }, [businessView, processFlowSteps, nodes]);

  const singleAgents = useMemo(() => (agents || []).filter(a => a.agentType === "single"), [agents]);
  const teamAgents = useMemo(() => (agents || []).filter(a => !!a.blueprintId), [agents]);

  const stateKeyConflictIds = useMemo(() => {
    const keyCounts: Record<string, string[]> = {};
    for (const n of nodes) {
      if (n.stateKey) {
        if (!keyCounts[n.stateKey]) keyCounts[n.stateKey] = [];
        keyCounts[n.stateKey].push(n.id);
      }
    }
    const ids = new Set<string>();
    for (const nodeIds of Object.values(keyCounts)) {
      if (nodeIds.length > 1) nodeIds.forEach(id => ids.add(id));
    }
    return ids;
  }, [nodes]);

  const invalidateGraph = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: graphQueryKey });
  }, [blueprintId]);

  const createNodeMutation = useMutation({
    mutationFn: async (nodeType: string) => {
      const def = TEAM_NODE_TYPES.find(t => t.type === nodeType);
      // Next open grid slot -- same shape as flow-graph-canvas.tsx's addNode.
      // Appropriate for a free-form 2D canvas; the old vertical-list-only
      // positionY: nodes.length * 120 made no sense once nodes can branch.
      const res = await apiRequest("POST", "/api/team-blueprint-nodes", {
        blueprintId,
        nodeType,
        label: def?.label || nodeType,
        positionX: (nodes.length % 5) * 280,
        positionY: Math.floor(nodes.length / 5) * 120 + 40,
      });
      return res.json() as Promise<TeamBlueprintNode>;
    },
    onSuccess: (created) => {
      invalidateGraph();
      setSelectedNodeId(created.id);
      setSelectedEdgeId(null);
      toast({ title: "Step added", description: `"${created.label}" was added at the end of the flow.` });
    },
    onError: (err: Error) => toast({ title: "Failed to add node", description: err.message, variant: "destructive" }),
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TeamBlueprintNode> }) => {
      await apiRequest("PATCH", `/api/team-blueprint-nodes/${id}`, updates);
    },
    onSuccess: () => invalidateGraph(),
    onError: (err: Error) => toast({ title: "Failed to update node", description: err.message, variant: "destructive" }),
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/team-blueprint-nodes/${id}`);
    },
    onSuccess: () => {
      invalidateGraph();
      setSelectedNodeId(null);
      toast({ title: "Node deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete node", description: err.message, variant: "destructive" }),
  });

  const createEdgeMutation = useMutation({
    mutationFn: async ({ sourceNodeId, targetNodeId }: { sourceNodeId: string; targetNodeId: string }) => {
      await apiRequest("POST", "/api/team-blueprint-edges", {
        blueprintId,
        sourceNodeId,
        targetNodeId,
        failureMode: "escalate",
      });
    },
    onSuccess: () => {
      invalidateGraph();
      toast({ title: "Edge created" });
    },
    onError: (err: Error) => toast({ title: "Failed to create edge", description: err.message, variant: "destructive" }),
  });

  const updateEdgeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TeamBlueprintEdge> }) => {
      await apiRequest("PATCH", `/api/team-blueprint-edges/${id}`, updates);
    },
    onSuccess: () => invalidateGraph(),
    onError: (err: Error) => toast({ title: "Failed to update edge", description: err.message, variant: "destructive" }),
  });

  const deleteEdgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/team-blueprint-edges/${id}`);
    },
    onSuccess: () => {
      invalidateGraph();
      setSelectedEdgeId(null);
      toast({ title: "Edge deleted" });
    },
    onError: (err: Error) => toast({ title: "Failed to delete edge", description: err.message, variant: "destructive" }),
  });

  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);

  const handleEdgeSelect = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  // Drag-to-connect from the canvas -- replaces the old click-source/
  // click-target "Add Edge" mode. Duplicate-edge guard preserved from the
  // old handleNodeClick edge-mode branch.
  const handleConnect = useCallback((sourceNodeId: string, targetNodeId: string) => {
    const alreadyExists = edges.some(e => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId);
    if (!alreadyExists) {
      createEdgeMutation.mutate({ sourceNodeId, targetNodeId });
    }
  }, [edges, createEdgeMutation]);

  const handleNodeDragStop = useCallback((nodeId: string, x: number, y: number) => {
    updateNodeMutation.mutate({ id: nodeId, updates: { positionX: x, positionY: y } });
  }, [updateNodeMutation]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedEdge = edges.find(e => e.id === selectedEdgeId);

  if (isLoading) {
    return (
      <div className="flex h-full" data-testid="team-graph-loading">
        <div className="w-[220px] border-r p-3 flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
        <div className="flex-1 p-6 flex flex-col items-center gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full max-w-md" />)}
        </div>
        <div className="w-[320px] border-l p-4">
          <Skeleton className="h-6 w-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="team-graph-editor">
      {/* Left Panel - Node Palette */}
      <div className="w-[220px] border-r shrink-0 flex flex-col">
        <div className="p-3 border-b">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team Node Palette</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-3">
            {TEAM_NODE_TYPES.map(nt => {
              const Icon = nt.icon;
              return (
                <div
                  key={nt.type}
                  className="flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer hover-elevate"
                  onClick={() => createNodeMutation.mutate(nt.type)}
                  data-testid={`button-add-team-node-${nt.type}`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${nt.color}`} />
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{nt.label}</span>
                  <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="p-3 border-t">
          <p className="text-[10px] text-muted-foreground mb-2">Drag from a node's right dot to a target node to connect them.</p>
          {teamAgentId && (
            <Button
              variant="default"
              size="sm"
              className="w-full"
              disabled={nodes.length === 0}
              onClick={() => setRunDialogOpen(true)}
              data-testid="button-run-team-graph"
            >
              <Play className="w-3.5 h-3.5 mr-1.5" /> Run Team Graph
            </Button>
          )}
        </div>
        {teamAgentId && <RecentExecutions teamAgentId={teamAgentId} />}
      </div>

      {teamAgentId && runDialogOpen && (
        <RunDagDialog teamAgentId={teamAgentId} open={runDialogOpen} onClose={() => setRunDialogOpen(false)} />
      )}

      {/* Center Panel - Graph Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0" data-testid="team-graph-canvas-container">
        <TeamGraphCanvas
          blueprintId={blueprintId}
          teamAgentId={teamAgentId}
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          stateKeyConflictIds={stateKeyConflictIds}
          getNodeDisplayLabel={getNodeDisplayLabel}
          agents={agents || []}
          remoteAgents={remoteAgents || []}
          skills={skills || []}
          knowledgeBases={knowledgeBases || []}
          onNodeSelect={handleNodeSelect}
          onEdgeSelect={handleEdgeSelect}
          onPaneClick={handlePaneClick}
          onConnect={handleConnect}
          onNodeDragStop={handleNodeDragStop}
          onNodeDelete={(id) => deleteNodeMutation.mutate(id)}
        />
      </div>

      {/* Right Panel - Config */}
      <div className="w-[320px] border-l shrink-0 flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 flex flex-col gap-4">
            {selectedNode ? (
              <NodeConfigPanel
                node={selectedNode}
                allNodes={nodes}
                singleAgents={singleAgents}
                teamAgentsList={teamAgents}
                remoteAgents={remoteAgents || []}
                mcpTools={mcpTools || []}
                policies={policies || []}
                skills={skills || []}
                knowledgeBases={knowledgeBases || []}
                onUpdate={(updates) => updateNodeMutation.mutate({ id: selectedNode.id, updates })}
                isPending={updateNodeMutation.isPending}
              />
            ) : selectedEdge ? (
              <EdgeConfigPanel
                edge={selectedEdge}
                nodes={nodes}
                onUpdate={(updates) => updateEdgeMutation.mutate({ id: selectedEdge.id, updates })}
                onDelete={() => deleteEdgeMutation.mutate(selectedEdge.id)}
                isPending={updateEdgeMutation.isPending}
                isDeletePending={deleteEdgeMutation.isPending}
              />
            ) : (
              <div className="flex flex-col gap-4" id="dag-state-schema-section">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">DAG State Schema</span>
                  <a
                    href="#dag-state-schema-section"
                    className="inline-flex items-center rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors no-underline"
                    data-testid="badge-schema-panel"
                  >
                    Schema
                  </a>
                </div>
                {teamAgentId ? (
                  <DagStateSchemaEditor teamAgentId={teamAgentId} />
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <MousePointer className="w-8 h-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground text-center" data-testid="text-no-selection">Select a node or edge to configure</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

interface ComputedWavePlan {
  totalWaves: number;
  maxParallelism: number;
  waves: Array<{ wave_number: number; nodes: string[] }>;
  nodeConfig: Record<string, { label: string }>;
}

function WavePlanDialog({ teamAgentId, open, onClose }: { teamAgentId: string; open: boolean; onClose: () => void }) {
  const { data: wavePlan, isLoading } = useQuery<ComputedWavePlan>({
    queryKey: ["/api/team-agents", teamAgentId, "dag-waves"],
    enabled: open && !!teamAgentId,
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-wave-plan">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="w-4 h-4 text-purple-500" /> Wave Plan
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : wavePlan ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span data-testid="text-wave-plan-total-waves"><span className="font-medium text-foreground">{wavePlan.totalWaves}</span> waves</span>
              <span data-testid="text-wave-plan-max-parallelism">max parallelism <span className="font-medium text-foreground">{wavePlan.maxParallelism}</span></span>
            </div>
            <div className="flex flex-col gap-2">
              {wavePlan.waves.map(wave => (
                <div key={wave.wave_number} className="flex flex-col gap-1.5 p-2.5 rounded-md border bg-muted/30" data-testid={`wave-row-${wave.wave_number}`}>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">Wave {wave.wave_number}</span>
                  <div className="flex flex-wrap gap-1">
                    {wave.nodes.map(nodeId => (
                      <Badge key={nodeId} variant="outline" className="text-[10px]">{wavePlan.nodeConfig[nodeId]?.label || nodeId}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-2">No wave plan available.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface StartDagRunResponse {
  dagRunId: string;
  status: string;
  totalWaves: number;
  totalNodes: number;
}

function RecentExecutions({ teamAgentId }: { teamAgentId: string }) {
  const [, navigate] = useLocation();
  const { data: runs } = useQuery<DagExecutionRun[]>({
    queryKey: ["/api/team-agents", teamAgentId, "dag-runs"],
    refetchInterval: (query) => {
      const d = query.state.data as DagExecutionRun[] | undefined;
      const anyLive = d?.some(r => r.status === "running" || r.status === "waiting_approval");
      return anyLive ? 3000 : false;
    },
  });

  if (!runs || runs.length === 0) return null;

  return (
    <div className="border-t p-3 flex flex-col gap-2 min-h-0">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <History className="w-3 h-3" /> Recent Executions
      </span>
      <ScrollArea className="max-h-[220px]">
        <div className="flex flex-col gap-1 pr-2">
          {runs.slice(0, 8).map(run => (
            <button
              key={run.id}
              type="button"
              onClick={() => navigate(`/dag-runs/${run.id}`)}
              className="flex items-center gap-1.5 p-1.5 rounded-md hover-elevate text-left"
              data-testid={`link-recent-execution-${run.id}`}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[10px] text-muted-foreground truncate">
                  {run.startedAt ? new Date(run.startedAt).toLocaleString() : run.id.substring(0, 8)}
                </span>
                <span className="text-[10px] text-muted-foreground">Wave {run.currentWave ?? 0}/{run.totalWaves ?? 0}</span>
              </div>
              <StatusBadge status={run.status} className="text-[9px] px-1.5 py-0 shrink-0" />
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunDagDialog({ teamAgentId, open, onClose }: { teamAgentId: string; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [request, setRequest] = useState("");

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/team-agents/${teamAgentId}/run-dag`, { request });
      return res.json() as Promise<StartDagRunResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team-agents", teamAgentId, "dag-runs"] });
      toast({ title: "Run started", description: `${data.totalWaves} wave${data.totalWaves !== 1 ? "s" : ""} to execute.` });
      setRequest("");
      onClose();
      navigate(`/dag-runs/${data.dagRunId}`);
    },
    onError: (err: Error) => toast({ title: "Run failed to start", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg" data-testid="dialog-run-dag">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" /> Run Team Graph
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Request (optional)</label>
            <Textarea
              value={request}
              onChange={e => setRequest(e.target.value)}
              placeholder="What should this team work on? Available to nodes as state.request."
              className="text-xs min-h-[70px]"
              disabled={runMutation.isPending}
              data-testid="textarea-run-request"
            />
          </div>
          <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending} data-testid="button-confirm-run-dag">
            {runMutation.isPending ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Starting...</>
            ) : (
              <><Play className="w-3.5 h-3.5 mr-1.5" /> Run</>
            )}
          </Button>
          {runMutation.isPending && (
            <span className="text-[11px] text-muted-foreground text-center">
              You'll be taken to the live monitoring view as soon as the run starts.
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NodeConfigPanel({
  node,
  allNodes,
  singleAgents,
  teamAgentsList,
  remoteAgents,
  mcpTools,
  policies,
  skills,
  knowledgeBases,
  onUpdate,
  isPending,
}: {
  node: TeamBlueprintNode;
  allNodes: TeamBlueprintNode[];
  singleAgents: Agent[];
  teamAgentsList: Agent[];
  remoteAgents: RemoteAgent[];
  mcpTools: McpServerTool[];
  policies: Policy[];
  skills: Skill[];
  knowledgeBases: KnowledgeBase[];
  onUpdate: (updates: Partial<TeamBlueprintNode>) => void;
  isPending: boolean;
}) {
  const autoStateKey = (label: string) => label.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  const nodeTypeUsesStateKey = (t: string) => t === "internal_agent" || t === "skill" || t === "knowledge_base" || t === "sub_flow" || t === "expression";

  const initialStateKey = (node.stateKey && node.stateKey.length > 0)
    ? node.stateKey
    : (nodeTypeUsesStateKey(node.nodeType) ? autoStateKey(node.label) : "");

  const [localLabel, setLocalLabel] = useState(node.label);
  const [localStateKey, setLocalStateKey] = useState(initialStateKey);
  const [localTimeoutMs, setLocalTimeoutMs] = useState(node.timeoutMs != null ? String(node.timeoutMs) : "30000");
  const [nodeKind, setNodeKind] = useState<"agent" | "team_reference">(node.refTeamAgentId ? "team_reference" : "agent");
  const [wavePlanOpen, setWavePlanOpen] = useState(false);

  const [localKbQuery, setLocalKbQuery] = useState((node.config as any)?.kbQuery || "");
  const [localExpression, setLocalExpression] = useState((node.config as any)?.expression || "");

  const [trackedNodeId, setTrackedNodeId] = useState(node.id);
  if (trackedNodeId !== node.id) {
    setTrackedNodeId(node.id);
    setLocalLabel(node.label);
    const nextStateKey = (node.stateKey && node.stateKey.length > 0)
      ? node.stateKey
      : (nodeTypeUsesStateKey(node.nodeType) ? autoStateKey(node.label) : "");
    setLocalStateKey(nextStateKey);
    setLocalTimeoutMs(node.timeoutMs != null ? String(node.timeoutMs) : "30000");
    setNodeKind(node.refTeamAgentId ? "team_reference" : "agent");
    setWavePlanOpen(false);
    setLocalKbQuery((node.config as any)?.kbQuery || "");
    setLocalExpression((node.config as any)?.expression || "");
  }

  useEffect(() => {
    if (nodeTypeUsesStateKey(node.nodeType) && (!node.stateKey || node.stateKey.length === 0) && initialStateKey) {
      onUpdate({ stateKey: initialStateKey });
    }
  }, [node.id]);

  const handleLabelBlur = () => {
    if (localLabel !== node.label) {
      const updates: Partial<TeamBlueprintNode> = { label: localLabel };
      if (!localStateKey && nodeTypeUsesStateKey(node.nodeType)) {
        const auto = autoStateKey(localLabel);
        setLocalStateKey(auto);
        updates.stateKey = auto;
      }
      onUpdate(updates);
    }
  };

  const stateKeyConflict = useMemo(() => {
    if (!localStateKey) return false;
    return allNodes.some(n => n.id !== node.id && n.stateKey === localStateKey);
  }, [allNodes, node.id, localStateKey]);

  const selectedAgent = node.refAgentId ? singleAgents.find(a => a.id === node.refAgentId) : null;
  const selectedTeamAgent = node.refTeamAgentId ? teamAgentsList.find(a => a.id === node.refTeamAgentId) : null;
  const selectedRemoteAgent = node.refRemoteAgentId ? remoteAgents.find(ra => ra.id === node.refRemoteAgentId) : null;
  const selectedPolicy = node.refPolicyId ? policies.find(p => p.id === node.refPolicyId) : null;
  const selectedSkill = (node as any).refSkillId ? skills.find(s => s.id === (node as any).refSkillId) : null;
  const selectedKb = (node as any).refKnowledgeBaseId ? knowledgeBases.find(k => k.id === (node as any).refKnowledgeBaseId) : null;
  const selectedToolIds = new Set(node.refToolIds || []);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className={`w-3 h-3 rounded-full ${NODE_COLOR_MAP[node.nodeType] || "bg-gray-500"}`} />
        <span className="text-sm font-medium">{node.nodeType.replace("_", " ")}</span>
        {isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Label</label>
        <Input
          value={localLabel}
          onChange={e => setLocalLabel(e.target.value)}
          onBlur={handleLabelBlur}
          data-testid="input-node-label"
        />
      </div>

      {node.nodeType === "internal_agent" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Node Kind</label>
            <div className="flex rounded-md border overflow-hidden" data-testid="toggle-node-kind">
              <button
                className={`flex-1 px-2 py-1.5 text-xs flex items-center justify-center gap-1.5 transition-colors ${nodeKind === "agent" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => {
                  setNodeKind("agent");
                  if (node.refTeamAgentId) onUpdate({ refTeamAgentId: null });
                }}
                data-testid="button-node-kind-agent"
              >
                <Brain className="w-3 h-3" /> Agent
              </button>
              <button
                className={`flex-1 px-2 py-1.5 text-xs flex items-center justify-center gap-1.5 transition-colors ${nodeKind === "team_reference" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                onClick={() => {
                  setNodeKind("team_reference");
                  if (node.refAgentId) onUpdate({ refAgentId: null });
                }}
                data-testid="button-node-kind-team-reference"
              >
                <Network className="w-3 h-3" /> Team Reference
              </button>
            </div>
          </div>

          {nodeKind === "agent" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Agent</label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={node.refAgentId || ""}
                  onChange={e => onUpdate({ refAgentId: e.target.value || null })}
                  data-testid="select-ref-agent"
                >
                  <option value="">-- Select Agent --</option>
                  {singleAgents.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {selectedAgent && (
                <Card>
                  <CardContent className="p-3 flex flex-col gap-1.5">
                    <span className="text-xs font-medium">{selectedAgent.name}</span>
                    {selectedAgent.description && <p className="text-xs text-muted-foreground">{selectedAgent.description}</p>}
                    <Badge variant="outline" className="w-fit text-[10px]">{selectedAgent.status}</Badge>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                  <span>Team Agent</span>
                  {node.refTeamAgentId && (
                    <button
                      className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 hover:underline"
                      onClick={() => setWavePlanOpen(true)}
                      data-testid="button-view-waves"
                    >
                      <Eye className="w-3 h-3" /> View Waves
                    </button>
                  )}
                </label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={node.refTeamAgentId || ""}
                  onChange={e => onUpdate({ refTeamAgentId: e.target.value || null, refAgentId: null })}
                  data-testid="select-ref-team-agent"
                >
                  <option value="">-- Select Team Agent --</option>
                  {teamAgentsList.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              {selectedTeamAgent && (
                <Card className="border-purple-500/30">
                  <CardContent className="p-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <Network className="w-3 h-3 text-purple-500 shrink-0" />
                      <span className="text-xs font-medium">{selectedTeamAgent.name}</span>
                    </div>
                    {selectedTeamAgent.description && <p className="text-xs text-muted-foreground">{selectedTeamAgent.description}</p>}
                    <Badge variant="outline" className="w-fit text-[10px] bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300">Team Agent</Badge>
                  </CardContent>
                </Card>
              )}
              {wavePlanOpen && node.refTeamAgentId && (
                <WavePlanDialog teamAgentId={node.refTeamAgentId} open={wavePlanOpen} onClose={() => setWavePlanOpen(false)} />
              )}
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              State Key
              {stateKeyConflict && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5" data-testid="badge-state-key-conflict">
                  <AlertTriangle className="w-2.5 h-2.5" /> conflict
                </Badge>
              )}
            </label>
            <Input
              value={localStateKey}
              onChange={e => setLocalStateKey(e.target.value)}
              onBlur={() => {
                const val = localStateKey || autoStateKey(localLabel);
                if (!localStateKey) setLocalStateKey(val);
                if (val !== (node.stateKey || "")) onUpdate({ stateKey: val || null });
              }}
              placeholder={autoStateKey(localLabel) || "e.g. research_output"}
              data-testid="input-state-key"
            />
          </div>
        </>
      )}

      {node.nodeType === "sub_flow" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center justify-between">
              <span>Team Agent</span>
              {node.refTeamAgentId && (
                <button
                  className="flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline"
                  onClick={() => setWavePlanOpen(true)}
                  data-testid="button-view-waves-sub-flow"
                >
                  <Eye className="w-3 h-3" /> View Waves
                </button>
              )}
            </label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={node.refTeamAgentId || ""}
              onChange={e => onUpdate({ refTeamAgentId: e.target.value || null })}
              data-testid="select-sub-flow-team-agent"
            >
              <option value="">-- Select Flow to Call --</option>
              {teamAgentsList.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          {selectedTeamAgent && (
            <Card className="border-indigo-500/30">
              <CardContent className="p-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Network className="w-3 h-3 text-indigo-500 shrink-0" />
                  <span className="text-xs font-medium">{selectedTeamAgent.name}</span>
                </div>
                {selectedTeamAgent.description && <p className="text-xs text-muted-foreground">{selectedTeamAgent.description}</p>}
                <Badge variant="outline" className="w-fit text-[10px] bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300">Sub-Flow</Badge>
              </CardContent>
            </Card>
          )}
          {wavePlanOpen && node.refTeamAgentId && (
            <WavePlanDialog teamAgentId={node.refTeamAgentId} open={wavePlanOpen} onClose={() => setWavePlanOpen(false)} />
          )}
          <p className="text-[10px] text-muted-foreground">
            This step runs the selected flow end to end and waits for it before continuing. Its full result is stored under this node's State Key.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              State Key
              {stateKeyConflict && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5" data-testid="badge-state-key-conflict-sub-flow">
                  <AlertTriangle className="w-2.5 h-2.5" /> conflict
                </Badge>
              )}
            </label>
            <Input
              value={localStateKey}
              onChange={e => setLocalStateKey(e.target.value)}
              onBlur={() => {
                const val = localStateKey || autoStateKey(localLabel);
                if (!localStateKey) setLocalStateKey(val);
                if (val !== (node.stateKey || "")) onUpdate({ stateKey: val || null });
              }}
              placeholder={autoStateKey(localLabel) || "e.g. sub_flow_output"}
              data-testid="input-state-key-sub-flow"
            />
          </div>
        </>
      )}

      {node.nodeType === "expression" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Expression (JSONata)</label>
            <Textarea
              value={localExpression}
              onChange={e => setLocalExpression(e.target.value)}
              onBlur={() => {
                if (localExpression !== ((node.config as any)?.expression || "")) {
                  onUpdate({ config: { ...(node.config as any || {}), expression: localExpression } } as any);
                }
              }}
              placeholder={'{ "total": amount + tax, "customer": customerName }'}
              rows={4}
              className="font-mono text-xs"
              data-testid="input-expression"
            />
            <p className="text-[10px] text-muted-foreground">
              Runs against the shared DAG state (every upstream node's output, flattened) with no LLM call -- reshape a
              JSON payload the way n8n's Function node does, without the cost or latency of a full agent step. Result
              is stored under this node's State Key. Uses{" "}
              <a href="https://docs.jsonata.org/overview" target="_blank" rel="noopener noreferrer" className="underline">
                JSONata syntax
              </a>.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              State Key
              {stateKeyConflict && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5" data-testid="badge-state-key-conflict-expression">
                  <AlertTriangle className="w-2.5 h-2.5" /> conflict
                </Badge>
              )}
            </label>
            <Input
              value={localStateKey}
              onChange={e => setLocalStateKey(e.target.value)}
              onBlur={() => {
                const val = localStateKey || autoStateKey(localLabel);
                if (!localStateKey) setLocalStateKey(val);
                if (val !== (node.stateKey || "")) onUpdate({ stateKey: val || null });
              }}
              placeholder={autoStateKey(localLabel) || "e.g. expression_output"}
              data-testid="input-state-key-expression"
            />
          </div>
        </>
      )}

      {node.nodeType === "tool_set" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Tools <Badge variant="outline" className="text-[10px] ml-1">{selectedToolIds.size} selected</Badge>
            </label>
            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto">
              {mcpTools.filter(t => t.enabled).map(tool => (
                <label key={tool.id} className="flex items-start gap-2 p-2 rounded-md border hover-elevate cursor-pointer" data-testid={`checkbox-tool-${tool.id}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={selectedToolIds.has(tool.id)}
                    onChange={e => {
                      const next = new Set(selectedToolIds);
                      if (e.target.checked) next.add(tool.id); else next.delete(tool.id);
                      onUpdate({ refToolIds: Array.from(next) });
                    }}
                  />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{tool.name}</span>
                    {tool.description && <span className="text-[10px] text-muted-foreground truncate">{tool.description}</span>}
                  </div>
                  {tool.riskClassification && (
                    <Badge variant="outline" className="text-[9px] shrink-0 ml-auto">{tool.riskClassification}</Badge>
                  )}
                </label>
              ))}
              {mcpTools.filter(t => t.enabled).length === 0 && (
                <p className="text-xs text-muted-foreground py-2">No enabled tools available</p>
              )}
            </div>
          </div>
        </>
      )}

      {node.nodeType === "edge_gate" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Gate Type</label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={node.gateType || ""}
              onChange={e => onUpdate({ gateType: e.target.value || null })}
              data-testid="select-gate-type"
            >
              <option value="">-- Select Gate Type --</option>
              <option value="approval">Approval</option>
              <option value="policy_check">Policy Check</option>
              <option value="manual_review">Manual Review</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Policy</label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={node.refPolicyId || ""}
              onChange={e => onUpdate({ refPolicyId: e.target.value || null })}
              data-testid="select-ref-policy"
            >
              <option value="">-- Select Policy --</option>
              {policies.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {selectedPolicy && (
            <Card>
              <CardContent className="p-3 flex flex-col gap-1.5">
                <span className="text-xs font-medium">{selectedPolicy.name}</span>
                {selectedPolicy.description && <p className="text-xs text-muted-foreground">{selectedPolicy.description}</p>}
                <Badge variant="outline" className="w-fit text-[10px]">{selectedPolicy.status}</Badge>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {node.nodeType === "remote_agent" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Remote Agent</label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={node.refRemoteAgentId || ""}
              onChange={e => onUpdate({ refRemoteAgentId: e.target.value || null })}
              data-testid="select-ref-remote-agent"
            >
              <option value="">-- Select Remote Agent --</option>
              {remoteAgents.map(ra => {
                const agentName = ra.agentId ? (singleAgents.find(a => a.id === ra.agentId)?.name || ra.agentId) : ra.id;
                return (
                  <option key={ra.id} value={ra.id}>{agentName} ({ra.trustTier || "basic"})</option>
                );
              })}
            </select>
          </div>
          {selectedRemoteAgent && (
            <Card>
              <CardContent className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${TRUST_TIER_COLORS[selectedRemoteAgent.trustTier || "basic"] || ""}`}>
                    {selectedRemoteAgent.trustTier || "basic"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">{selectedRemoteAgent.connectivityStatus || "unknown"}</Badge>
                </div>
                {selectedRemoteAgent.allowedSkills && selectedRemoteAgent.allowedSkills.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-muted-foreground font-medium">Allowed Skills</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedRemoteAgent.allowedSkills.map(skill => (
                        <Badge key={skill} variant="outline" className="text-[9px]">{skill}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRemoteAgent.agentCardUrl && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground font-medium">A2A Card URL</span>
                    <span className="text-[10px] text-muted-foreground truncate">{selectedRemoteAgent.agentCardUrl}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {node.nodeType === "skill" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Skill</label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={(node as any).refSkillId || ""}
              onChange={e => onUpdate({ refSkillId: e.target.value || null } as any)}
              data-testid="select-ref-skill"
            >
              <option value="">-- Select Skill --</option>
              {skills.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              At runtime, this skill's content is merged into shared DAG state under State Key — any agent node reached afterward picks it up automatically.
            </p>
          </div>
          {selectedSkill && (
            <Card className="border-teal-500/30">
              <CardContent className="p-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-teal-500 shrink-0" />
                  <span className="text-xs font-medium">{selectedSkill.name}</span>
                </div>
                {selectedSkill.description && <p className="text-xs text-muted-foreground">{selectedSkill.description}</p>}
                {selectedSkill.allowedTools && selectedSkill.allowedTools.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedSkill.allowedTools.map(t => (
                      <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              State Key
              {stateKeyConflict && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> conflict
                </Badge>
              )}
            </label>
            <Input
              value={localStateKey}
              onChange={e => setLocalStateKey(e.target.value)}
              onBlur={() => {
                const val = localStateKey || autoStateKey(localLabel);
                if (!localStateKey) setLocalStateKey(val);
                if (val !== (node.stateKey || "")) onUpdate({ stateKey: val || null });
              }}
              placeholder={autoStateKey(localLabel) || "e.g. compliance_context"}
              data-testid="input-skill-state-key"
            />
          </div>
        </>
      )}

      {node.nodeType === "knowledge_base" && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Knowledge Base</label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              value={(node as any).refKnowledgeBaseId || ""}
              onChange={e => onUpdate({ refKnowledgeBaseId: e.target.value || null } as any)}
              data-testid="select-ref-kb"
            >
              <option value="">-- Select Knowledge Base --</option>
              {knowledgeBases.map(kb => (
                <option key={kb.id} value={kb.id}>{kb.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              At runtime, this searches the KB with the query below and merges the results into shared DAG state under State Key — any agent node reached afterward picks them up automatically.
            </p>
          </div>
          {selectedKb && (
            <Card className="border-emerald-500/30">
              <CardContent className="p-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Database className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="text-xs font-medium">{selectedKb.name}</span>
                </div>
                {selectedKb.description && <p className="text-xs text-muted-foreground">{selectedKb.description}</p>}
              </CardContent>
            </Card>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Search Query</label>
            <Input
              value={localKbQuery}
              onChange={e => setLocalKbQuery(e.target.value)}
              onBlur={() => {
                if (localKbQuery !== ((node.config as any)?.kbQuery || "")) {
                  onUpdate({ config: { ...(node.config as any || {}), kbQuery: localKbQuery } } as any);
                }
              }}
              placeholder="e.g. return policy exceptions for damaged goods"
              data-testid="input-kb-query"
            />
            <p className="text-[10px] text-muted-foreground">
              A fixed search query -- this node isn't conversational, so it can't reformulate its own query from context.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              State Key
              {stateKeyConflict && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> conflict
                </Badge>
              )}
            </label>
            <Input
              value={localStateKey}
              onChange={e => setLocalStateKey(e.target.value)}
              onBlur={() => {
                const val = localStateKey || autoStateKey(localLabel);
                if (!localStateKey) setLocalStateKey(val);
                if (val !== (node.stateKey || "")) onUpdate({ stateKey: val || null });
              }}
              placeholder={autoStateKey(localLabel) || "e.g. return_policy_context"}
              data-testid="input-kb-state-key"
            />
          </div>
        </>
      )}

      {(node.nodeType === "internal_agent" || node.nodeType === "remote_agent") && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Timeout (ms)</label>
          <Input
            type="number"
            value={localTimeoutMs}
            onChange={e => setLocalTimeoutMs(e.target.value)}
            onBlur={() => {
              const parsed = localTimeoutMs ? parseInt(localTimeoutMs) : 30000;
              const val = isNaN(parsed) || parsed <= 0 ? 30000 : parsed;
              if (!isNaN(parsed) && val !== (node.timeoutMs ?? 30000)) onUpdate({ timeoutMs: val });
            }}
            placeholder="30000"
            data-testid="input-timeout-ms"
          />
          {localTimeoutMs && parseInt(localTimeoutMs) > 0 && (
            <span className="text-[10px] text-muted-foreground">{(parseInt(localTimeoutMs) / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </>
  );
}

// Renders a RuleGroup's flat leaves as plain-English sentences ("If invoiceAmount
// is more than 10000") instead of the raw field/operator/value grid -- same
// RuleLeaf[] state as the Advanced view, so switching tabs never loses data.
function SimpleRuleView({
  ruleLeaves,
  combinator,
  sourceNode,
  onUpdateLeaf,
  onRemoveLeaf,
  onAddLeaf,
  onSetCombinator,
}: {
  ruleLeaves: RuleLeaf[];
  combinator: "AND" | "OR";
  sourceNode: TeamBlueprintNode | undefined;
  onUpdateLeaf: (index: number, patch: Partial<RuleLeaf>) => void;
  onRemoveLeaf: (index: number) => void;
  onAddLeaf: () => void;
  onSetCombinator: (c: "AND" | "OR") => void;
}) {
  const declaredFields: string[] = Array.isArray((sourceNode?.outputSchema as any)?.fields)
    ? (sourceNode!.outputSchema as any).fields.map((f: any) => f?.name).filter(Boolean)
    : [];

  // When the source is a Team Reference node, the fields a rule can actually
  // check live one level down -- inside the referenced team's own nodes
  // (see server/dag-execution-engine.ts mergeWaveOutputs/buildPipelineState:
  // a nested team's node outputs flatten up into this team's gating state
  // under each node's own stateKey). Reuse the same dag-waves endpoint the
  // "View Waves" button already calls to list them, so the field box offers
  // real, guessable names instead of the empty "you'll need to type it"
  // fallback -- the exact gap that made the original briefApproved gate
  // impossible to configure correctly without reading the engine's source.
  const { data: childWavePlan } = useQuery<{ nodeConfig: Record<string, { stateKey: string; label: string; gateType?: string | null }> }>({
    queryKey: ["/api/team-agents", sourceNode?.refTeamAgentId, "dag-waves"],
    enabled: !!sourceNode?.refTeamAgentId,
  });
  const childFields: string[] = childWavePlan?.nodeConfig
    ? Object.values(childWavePlan.nodeConfig).flatMap(nc => {
        const key = nc.stateKey;
        if (!key) return [];
        // Human-approval gate nodes output { approved, decidedBy } under
        // their own stateKey (server/dag-execution-engine.ts executeGateNode)
        // -- surface the dotted paths a rule actually needs, not just the
        // bare key, since "brief_approval_agent" alone resolves to an
        // object, not the boolean a rule compares against.
        if (nc.gateType) return [`${key}.approved`, `${key}.decidedBy`];
        return [key];
      })
    : [];
  const knownFields: string[] = Array.from(new Set([...declaredFields, ...childFields]));
  const fieldListId = `edge-field-suggestions-${sourceNode?.id || "none"}`;

  return (
    <div className="flex flex-col gap-1.5">
      {knownFields.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          {sourceNode ? `"${sourceNode.label}" hasn't declared its output fields, so you'll need to type the field name.` : "Connect this edge to a source step to get field suggestions."}
        </p>
      )}
      {knownFields.length > 0 && sourceNode?.refTeamAgentId && (
        <p className="text-[10px] text-muted-foreground">
          Fields from inside "{sourceNode.label}" — pick one below, or type your own.
        </p>
      )}
      {ruleLeaves.map((leaf, i) => (
        <div key={i} className="flex flex-col gap-1">
          {i > 0 && (
            <button
              type="button"
              className="self-start text-[11px] font-medium text-primary hover:underline"
              onClick={() => onSetCombinator(combinator === "AND" ? "OR" : "AND")}
              data-testid={`button-toggle-combinator-${i}`}
            >
              {combinator === "AND" ? "and if…" : "or if…"}
            </button>
          )}
          <div className="flex items-center gap-1.5 flex-wrap rounded-md border p-2" data-testid={`simple-rule-row-${i}`}>
            <span className="text-xs text-muted-foreground shrink-0">{i === 0 ? "If" : ""}</span>
            <Input
              className="h-7 text-xs flex-1 min-w-[100px]"
              value={leaf.field}
              onChange={e => onUpdateLeaf(i, { field: e.target.value })}
              placeholder="field, e.g. invoiceAmount"
              list={fieldListId}
              data-testid={`input-simple-rule-field-${i}`}
            />
            <select
              className="h-7 rounded-md border bg-background px-1.5 text-xs shrink-0"
              value={leaf.operator}
              onChange={e => onUpdateLeaf(i, { operator: e.target.value as RuleOperator })}
              data-testid={`select-simple-rule-operator-${i}`}
            >
              {RULE_OPERATORS.map(op => <option key={op.value} value={op.value}>{RULE_OPERATOR_PHRASES[op.value]}</option>)}
            </select>
            {(() => {
              // Catch a broken gate at authoring time instead of letting it
              // silently block every run: if we know the full set of fields
              // this source can ever produce and the typed field (or its
              // root, before a dot-path) isn't among them, say so right here
              // -- this is exactly the class of mistake that made the
              // original briefApproved gate impossible to notice was wrong
              // until a live run was inspected node-by-node.
              if (!leaf.field.trim() || knownFields.length === 0) return null;
              const root = leaf.field.split(".")[0];
              const matches = knownFields.some(f => f === leaf.field || f.split(".")[0] === root);
              if (matches) return null;
              return (
                <span
                  className="text-[10px] text-destructive basis-full"
                  data-testid={`warning-unknown-field-${i}`}
                  title="This field name doesn't match anything the source step is known to produce -- this condition will likely never be true."
                >
                  ⚠ "{root}" isn't a known field from this source — this condition may never match.
                </span>
              );
            })()}
            <Input
              className="h-7 text-xs flex-1 min-w-[80px]"
              value={String(leaf.value)}
              onChange={e => onUpdateLeaf(i, { value: e.target.value })}
              placeholder="value"
              data-testid={`input-simple-rule-value-${i}`}
            />
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemoveLeaf(i)}
              data-testid={`button-remove-simple-rule-${i}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {knownFields.length > 0 && (
        <datalist id={fieldListId}>
          {knownFields.map(f => <option key={f} value={f} />)}
        </datalist>
      )}
      <Button variant="outline" size="sm" onClick={onAddLeaf} data-testid="button-add-simple-rule-condition">
        <Plus className="w-3.5 h-3.5 mr-1" /> Add Condition
      </Button>
      {ruleLeaves.length === 0 && (
        <p className="text-[10px] text-muted-foreground">No conditions yet — this edge always routes (equivalent to no gate).</p>
      )}
    </div>
  );
}

function EdgeConfigPanel({
  edge,
  nodes,
  onUpdate,
  onDelete,
  isPending,
  isDeletePending,
}: {
  edge: TeamBlueprintEdge;
  nodes: TeamBlueprintNode[];
  onUpdate: (updates: Partial<TeamBlueprintEdge>) => void;
  onDelete: () => void;
  isPending: boolean;
  isDeletePending: boolean;
}) {
  const [localLabel, setLocalLabel] = useState(edge.label || "");
  const [localMetadata, setLocalMetadata] = useState(JSON.stringify(edge.allowedMetadata || {}, null, 2));
  const [localRetryPolicy, setLocalRetryPolicy] = useState(JSON.stringify(edge.retryPolicy || { maxRetries: 3, backoffMs: 1000 }, null, 2));
  const [localCondition, setLocalCondition] = useState(edge.condition || "");
  const [localSla, setLocalSla] = useState(edge.slaTimeoutMs != null ? String(edge.slaTimeoutMs) : "");
  const [localRule, setLocalRule] = useState<RuleGroup>((edge.rule as RuleGroup) || { combinator: "AND", conditions: [] });
  // Every edge opens in Simple (sentence) view by default -- Advanced (raw
  // field/operator/value grid) is an opt-in for anyone who wants direct control.
  const [ruleView, setRuleView] = useState<"simple" | "advanced">("simple");

  const [trackedEdgeId, setTrackedEdgeId] = useState(edge.id);
  if (trackedEdgeId !== edge.id) {
    setTrackedEdgeId(edge.id);
    setLocalLabel(edge.label || "");
    setLocalMetadata(JSON.stringify(edge.allowedMetadata || {}, null, 2));
    setLocalRetryPolicy(JSON.stringify(edge.retryPolicy || { maxRetries: 3, backoffMs: 1000 }, null, 2));
    setLocalCondition(edge.condition || "");
    setLocalSla(edge.slaTimeoutMs != null ? String(edge.slaTimeoutMs) : "");
    setLocalRule((edge.rule as RuleGroup) || { combinator: "AND", conditions: [] });
  }

  const evaluationMode = edge.evaluationMode || "ai";
  // Flat rule builder: the data model (shared/schema.ts RuleGroup) and the
  // deterministic evaluator (server/rule-evaluator.ts) both support nested
  // AND/OR groups, but this UI only ever constructs one flat group of leaf
  // conditions -- covers realistic business rules ("amount > 10000 AND
  // vendorApproved == false") without the added complexity of a nested
  // group-builder UI.
  const ruleLeaves = localRule.conditions.filter((c): c is RuleLeaf => "field" in c);

  function commitRule(next: RuleGroup) {
    setLocalRule(next);
    onUpdate({ rule: next as any });
  }
  function updateLeaf(index: number, patch: Partial<RuleLeaf>) {
    const next = { ...localRule, conditions: ruleLeaves.map((c, i) => (i === index ? { ...c, ...patch } : c)) };
    commitRule(next);
  }
  function addLeaf() {
    commitRule({ ...localRule, conditions: [...ruleLeaves, { field: "", operator: ">" as RuleOperator, value: "" }] });
  }
  function removeLeaf(index: number) {
    commitRule({ ...localRule, conditions: ruleLeaves.filter((_, i) => i !== index) });
  }

  const sourceNode = nodes.find(n => n.id === edge.sourceNodeId);
  const targetNode = nodes.find(n => n.id === edge.targetNodeId);
  const contentPartTypes = new Set(edge.contentPartTypes || []);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Link2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">Edge Contract</span>
        {isPending && <span className="text-xs text-muted-foreground">Saving...</span>}
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <span>{sourceNode?.label || "?"}</span>
        <span>&rarr;</span>
        <span>{targetNode?.label || "?"}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Label</label>
        <Input
          value={localLabel}
          onChange={e => setLocalLabel(e.target.value)}
          onBlur={() => { if (localLabel !== (edge.label || "")) onUpdate({ label: localLabel || null }); }}
          data-testid="input-edge-label"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Content Part Types</label>
        <div className="flex flex-col gap-1">
          {PART_TYPE_OPTIONS.map(pt => {
            const PtIcon = pt.icon;
            return (
              <label key={pt.value} className="flex items-center gap-2 p-1.5 rounded-md border hover-elevate cursor-pointer" data-testid={`checkbox-part-type-${pt.value}`}>
                <input
                  type="checkbox"
                  className="shrink-0"
                  checked={contentPartTypes.has(pt.value)}
                  onChange={e => {
                    const next = new Set(contentPartTypes);
                    if (e.target.checked) next.add(pt.value); else next.delete(pt.value);
                    onUpdate({ contentPartTypes: Array.from(next) });
                  }}
                />
                <PtIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-xs">{pt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Allowed Metadata (JSON)</label>
        <textarea
          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono min-h-[60px] resize-y"
          value={localMetadata}
          onChange={e => setLocalMetadata(e.target.value)}
          onBlur={() => {
            try {
              const parsed = JSON.parse(localMetadata);
              onUpdate({ allowedMetadata: parsed });
            } catch { /* ignore invalid json */ }
          }}
          placeholder='{"format": "json", "encoding": "utf-8"}'
          data-testid="textarea-allowed-metadata"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">SLA / Timeout (ms)</label>
        <Input
          type="number"
          value={localSla}
          onChange={e => setLocalSla(e.target.value)}
          onBlur={() => {
            const val = localSla ? parseInt(localSla) : null;
            onUpdate({ slaTimeoutMs: val });
          }}
          placeholder="e.g. 5000"
          data-testid="input-sla-timeout"
        />
        {localSla && parseInt(localSla) > 0 && (
          <span className="text-[10px] text-muted-foreground">{(parseInt(localSla) / 1000).toFixed(1)}s</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Failure Mode</label>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={edge.failureMode || "escalate"}
          onChange={e => onUpdate({ failureMode: e.target.value })}
          data-testid="select-failure-mode"
        >
          <option value="retry">Retry - Automatically retry the operation</option>
          <option value="skip">Skip - Skip this edge and continue</option>
          <option value="escalate">Escalate - Escalate to human review</option>
        </select>
      </div>

      {edge.failureMode === "retry" && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Retry Policy (JSON)</label>
          <textarea
            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs font-mono min-h-[60px] resize-y"
            value={localRetryPolicy}
            onChange={e => setLocalRetryPolicy(e.target.value)}
            onBlur={() => {
              try {
                const parsed = JSON.parse(localRetryPolicy);
                onUpdate({ retryPolicy: parsed });
              } catch { /* ignore invalid json */ }
            }}
            data-testid="textarea-retry-policy"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Routing Evaluation</label>
        <div className="flex rounded-md border overflow-hidden" data-testid="toggle-evaluation-mode">
          <button
            type="button"
            className={`flex-1 px-2 py-1.5 text-xs ${evaluationMode === "ai" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
            onClick={() => onUpdate({ evaluationMode: "ai" })}
            data-testid="button-mode-ai"
          >
            AI Judgment
          </button>
          <button
            type="button"
            className={`flex-1 px-2 py-1.5 text-xs ${evaluationMode === "deterministic" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
            onClick={() => onUpdate({ evaluationMode: "deterministic" })}
            data-testid="button-mode-deterministic"
          >
            Deterministic Rule
          </button>
          <button
            type="button"
            className={`flex-1 px-2 py-1.5 text-xs ${evaluationMode === "handoff" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
            onClick={() => onUpdate({ evaluationMode: "handoff" })}
            data-testid="button-mode-handoff"
          >
            Handoff
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {evaluationMode === "ai"
            ? "An LLM reads the free-text condition against the upstream output and judges true/false — right for subjective calls, not for anything that must be 100% reliable."
            : evaluationMode === "handoff"
            ? "The upstream agent itself names which node to hand off to — no condition to configure here. Right for open-ended routing where the agent decides who should handle it next, like a triage agent picking a specialist."
            : "Plain comparison logic against the upstream output's data — no model call, always reliable and auditable. Right for thresholds, compliance checks, and other business rules."}
        </p>
      </div>

      {evaluationMode === "ai" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Condition</label>
          <Input
            value={localCondition}
            onChange={e => setLocalCondition(e.target.value)}
            onBlur={() => { if (localCondition !== (edge.condition || "")) onUpdate({ condition: localCondition || null }); }}
            placeholder='e.g. output.confidence > 0.8'
            data-testid="input-edge-condition"
          />
        </div>
      ) : evaluationMode === "handoff" ? (
        <div className="flex flex-col gap-1.5 rounded-md border p-2 bg-muted/30" data-testid="handoff-info">
          <span className="text-xs font-medium">This node is a handoff target</span>
          <p className="text-[11px] text-muted-foreground">
            For this edge to fire, "{sourceNode?.label || "the upstream agent"}" must include a{" "}
            <code className="text-[10px] bg-background px-1 rounded">handoff_to</code> field in its output naming{" "}
            <code className="text-[10px] bg-background px-1 rounded">"{targetNode?.label || "this node"}"</code>{" "}
            (matching is case/punctuation-insensitive, so close variants work too).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="rule-builder">
          <div className="flex rounded-md border overflow-hidden self-start" data-testid="toggle-rule-view">
            <button
              type="button"
              className={`px-2 py-1 text-[11px] ${ruleView === "simple" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
              onClick={() => setRuleView("simple")}
              data-testid="button-rule-view-simple"
            >
              Simple
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-[11px] ${ruleView === "advanced" ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
              onClick={() => setRuleView("advanced")}
              data-testid="button-rule-view-advanced"
            >
              Advanced
            </button>
          </div>

          {ruleView === "simple" ? (
            <SimpleRuleView
              ruleLeaves={ruleLeaves}
              combinator={localRule.combinator}
              sourceNode={sourceNode}
              onUpdateLeaf={updateLeaf}
              onRemoveLeaf={removeLeaf}
              onAddLeaf={addLeaf}
              onSetCombinator={c => commitRule({ ...localRule, combinator: c })}
            />
          ) : (
            <>
              {ruleLeaves.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Match</span>
                  <select
                    className="h-7 rounded-md border bg-background px-2 text-xs"
                    value={localRule.combinator}
                    onChange={e => commitRule({ ...localRule, combinator: e.target.value as "AND" | "OR" })}
                    data-testid="select-rule-combinator"
                  >
                    <option value="AND">ALL conditions (AND)</option>
                    <option value="OR">ANY condition (OR)</option>
                  </select>
                </div>
              )}
              {ruleLeaves.map((leaf, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-md border p-2" data-testid={`rule-row-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-7 text-xs flex-1"
                      value={leaf.field}
                      onChange={e => updateLeaf(i, { field: e.target.value })}
                      placeholder="field, e.g. invoiceAmount"
                      data-testid={`input-rule-field-${i}`}
                    />
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeLeaf(i)}
                      data-testid={`button-remove-rule-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      className="h-7 rounded-md border bg-background px-1.5 text-xs flex-1"
                      value={leaf.operator}
                      onChange={e => updateLeaf(i, { operator: e.target.value as RuleOperator })}
                      data-testid={`select-rule-operator-${i}`}
                    >
                      {RULE_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                    </select>
                    <Input
                      className="h-7 text-xs flex-1"
                      value={String(leaf.value)}
                      onChange={e => updateLeaf(i, { value: e.target.value })}
                      placeholder="value"
                      data-testid={`input-rule-value-${i}`}
                    />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addLeaf} data-testid="button-add-rule-condition">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Condition
              </Button>
              {ruleLeaves.length === 0 && (
                <p className="text-[10px] text-muted-foreground">No conditions yet — this edge always routes (equivalent to no gate).</p>
              )}
            </>
          )}
        </div>
      )}

      <div className="pt-2 border-t">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onDelete}
          disabled={isDeletePending}
          data-testid={`button-delete-edge-${edge.id}`}
        >
          <X className="w-3.5 h-3.5 mr-1.5" /> {isDeletePending ? "Deleting..." : "Delete Edge"}
        </Button>
      </div>
    </>
  );
}

type SchemaField = {
  rowKey: string;
  fieldName: string;
  type: "string" | "object" | "array" | "number";
  writableBy: string;
  reducer: "last_wins" | "append" | "merge_object" | "sum";
};

type SortCol = "fieldName" | "type" | "reducer" | null;

function DagStateSchemaEditor({ teamAgentId }: { teamAgentId: string }) {
  const { toast } = useToast();
  const [localFields, setLocalFields] = useState<SchemaField[]>([]);
  const [schemaId, setSchemaId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const { data: schema, isLoading } = useQuery<DagStateSchema | null>({
    queryKey: ["/api/dag-state-schemas/by-team", teamAgentId],
    queryFn: async () => {
      const res = await fetch(`/api/dag-state-schemas/by-team/${teamAgentId}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!teamAgentId,
  });

  useEffect(() => {
    if (schema) {
      setSchemaId(schema.id);
      type StoredFieldDef = { type?: string; writable_by?: string | string[]; writableBy?: string; reducer?: string };
      const fieldsObj = (schema.fields || {}) as Record<string, StoredFieldDef>;
      const reducersObj = (schema.reducers || {}) as Record<string, string>;
      const parsed: SchemaField[] = Object.entries(fieldsObj).map(([fieldName, def]) => {
        const writableByRaw = def?.writable_by ?? def?.writableBy;
        const writableByStr = Array.isArray(writableByRaw)
          ? writableByRaw.join(",")
          : (typeof writableByRaw === "string" ? writableByRaw : "*");
        return {
          rowKey: `${fieldName}-${Math.random()}`,
          fieldName,
          type: (def?.type || "string") as SchemaField["type"],
          writableBy: writableByStr || "*",
          reducer: (def?.reducer || reducersObj[fieldName] || "last_wins") as SchemaField["reducer"],
        };
      });
      setLocalFields(parsed);
      setIsDirty(false);
    } else if (!isLoading) {
      setLocalFields([]);
      setSchemaId(null);
      setIsDirty(false);
    }
  }, [schema, isLoading]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fields: Record<string, { type: string; writable_by: string[]; reducer: string }> = {};
      const reducers: Record<string, string> = {};
      for (const f of localFields) {
        if (!f.fieldName.trim()) continue;
        const writableByArr = f.writableBy.trim() === ""
          ? ["*"]
          : f.writableBy.split(",").map(s => s.trim()).filter(Boolean);
        fields[f.fieldName] = {
          type: f.type,
          writable_by: writableByArr,
          reducer: f.reducer,
        };
        reducers[f.fieldName] = f.reducer;
      }
      if (schemaId) {
        const res = await apiRequest("PATCH", `/api/dag-state-schemas/${schemaId}`, { fields, reducers });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/dag-state-schemas", { teamAgentId, fields, reducers });
        return res.json();
      }
    },
    onSuccess: (data: DagStateSchema) => {
      if (!schemaId && data?.id) setSchemaId(data.id);
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/dag-state-schemas/by-team", teamAgentId] });
      toast({ title: "Schema saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save schema", description: err.message, variant: "destructive" });
    },
  });

  const addField = () => {
    setLocalFields(prev => [...prev, {
      rowKey: `new-${Date.now()}`,
      fieldName: "",
      type: "object",
      writableBy: "*",
      reducer: "last_wins",
    }]);
    setIsDirty(true);
  };

  const removeField = (rowKey: string) => {
    setLocalFields(prev => prev.filter(f => f.rowKey !== rowKey));
    setIsDirty(true);
  };

  const updateField = (rowKey: string, updates: Partial<SchemaField>) => {
    setLocalFields(prev => prev.map(f => f.rowKey === rowKey ? { ...f, ...updates } : f));
    setIsDirty(true);
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortAsc(a => !a);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortedFields = useMemo(() => {
    if (!sortCol) return localFields;
    return [...localFields].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [localFields, sortCol, sortAsc]);

  const summaryStr = useMemo(() => {
    if (localFields.length === 0) return "No fields defined";
    const counts: Record<string, number> = {};
    for (const f of localFields) counts[f.reducer] = (counts[f.reducer] || 0) + 1;
    const parts = Object.entries(counts).map(([r, c]) => `${c} ${r}`);
    return `${localFields.length} field${localFields.length !== 1 ? "s" : ""} — ${parts.join(", ")}`;
  }, [localFields]);

  const SortIcon = ({ col }: { col: SortCol }) => (
    <span className={`ml-0.5 text-[8px] ${sortCol === col ? "text-foreground" : "text-muted-foreground/50"}`}>
      {sortCol === col ? (sortAsc ? "▲" : "▼") : "⇅"}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="dag-state-schema-editor">
      {localFields.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2 border border-dashed rounded-md">
          <Database className="w-6 h-6 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground text-center" data-testid="text-schema-empty">No fields defined yet. Add a field to start.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          {/* Table header */}
          <div className="grid bg-muted/50 border-b" style={{ gridTemplateColumns: "1fr 52px 44px 76px 24px" }}>
            <button
              className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-left flex items-center hover:text-foreground transition-colors"
              onClick={() => handleSort("fieldName")}
              data-testid="th-field-name"
            >
              Field Name<SortIcon col="fieldName" />
            </button>
            <button
              className="px-1 py-1.5 text-[10px] font-medium text-muted-foreground text-left flex items-center hover:text-foreground transition-colors"
              onClick={() => handleSort("type")}
              data-testid="th-type"
            >
              Type<SortIcon col="type" />
            </button>
            <div className="px-1 py-1.5 text-[10px] font-medium text-muted-foreground" title="Writable By (comma-separated agent IDs, or * for all)">Writable By</div>
            <button
              className="px-1 py-1.5 text-[10px] font-medium text-muted-foreground text-left flex items-center hover:text-foreground transition-colors"
              onClick={() => handleSort("reducer")}
              data-testid="th-reducer"
            >
              Reducer<SortIcon col="reducer" />
            </button>
            <div />
          </div>
          {/* Table rows */}
          {sortedFields.map((field, idx) => (
            <div
              key={field.rowKey}
              className="grid border-b last:border-b-0 hover:bg-muted/20 transition-colors"
              style={{ gridTemplateColumns: "1fr 52px 44px 76px 24px" }}
              data-testid={`schema-field-row-${idx}`}
            >
              <div className="px-1.5 py-1 flex flex-col justify-center gap-0.5">
                <input
                  className="w-full h-6 rounded border bg-background px-1.5 text-[10px] font-mono"
                  placeholder="field_name"
                  value={field.fieldName}
                  onChange={e => updateField(field.rowKey, { fieldName: e.target.value })}
                  data-testid={`input-schema-field-name-${idx}`}
                />
                {field.reducer === "append" && (
                  <span className="text-[8px] text-blue-600 dark:text-blue-400" data-testid={`badge-append-indicator-${idx}`}>⊕ append array</span>
                )}
              </div>
              <div className="px-1 py-1 flex items-center">
                <select
                  className="w-full h-6 rounded border bg-background px-0.5 text-[9px]"
                  value={field.type}
                  onChange={e => updateField(field.rowKey, { type: e.target.value as SchemaField["type"] })}
                  data-testid={`select-schema-field-type-${idx}`}
                >
                  <option value="string">str</option>
                  <option value="object">obj</option>
                  <option value="array">arr</option>
                  <option value="number">num</option>
                </select>
              </div>
              <div className="px-1 py-1 flex items-center">
                <input
                  className="w-full h-6 rounded border bg-background px-1 text-[9px] font-mono"
                  placeholder="*"
                  value={field.writableBy}
                  onChange={e => updateField(field.rowKey, { writableBy: e.target.value })}
                  title="Writable By: * for all, or comma-separated agent IDs"
                  data-testid={`input-schema-field-writable-by-${idx}`}
                />
              </div>
              <div className="px-1 py-1 flex items-center">
                <select
                  className="w-full h-6 rounded border bg-background px-0.5 text-[9px]"
                  value={field.reducer}
                  onChange={e => updateField(field.rowKey, { reducer: e.target.value as SchemaField["reducer"] })}
                  data-testid={`select-schema-field-reducer-${idx}`}
                >
                  <option value="last_wins">last_wins</option>
                  <option value="append">⊕ append</option>
                  <option value="merge_object">merge_obj</option>
                  <option value="sum">sum</option>
                </select>
              </div>
              <div className="flex items-center justify-center">
                <button
                  className="w-5 h-5 rounded flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => removeField(field.rowKey)}
                  data-testid={`button-delete-schema-field-${idx}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground" data-testid="text-schema-summary">{summaryStr}</p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={addField}
          data-testid="button-add-schema-field"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Field
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
          data-testid="button-save-schema"
        >
          <Save className="w-3.5 h-3.5 mr-1" /> {saveMutation.isPending ? "Saving..." : "Save Schema"}
        </Button>
      </div>
    </div>
  );
}
