import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { TeamBlueprintNode, TeamBlueprintEdge, Agent, RemoteAgent, Policy } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Brain, Wrench, ShieldCheck, Globe, Plus, X, Link2, MousePointer,
  FileText, Database, Type, Link as LinkIcon,
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
}

const TEAM_NODE_TYPES = [
  { type: "internal_agent", label: "Internal Agent", icon: Brain, color: "bg-blue-500" },
  { type: "tool_set", label: "Tool Set", icon: Wrench, color: "bg-amber-500" },
  { type: "edge_gate", label: "Edge Gate", icon: ShieldCheck, color: "bg-orange-500" },
  { type: "remote_agent", label: "Remote Agent", icon: Globe, color: "bg-purple-500" },
] as const;

const NODE_COLOR_MAP: Record<string, string> = {
  internal_agent: "bg-blue-500",
  tool_set: "bg-amber-500",
  edge_gate: "bg-orange-500",
  remote_agent: "bg-purple-500",
};

const NODE_ICON_MAP: Record<string, typeof Brain> = {
  internal_agent: Brain,
  tool_set: Wrench,
  edge_gate: ShieldCheck,
  remote_agent: Globe,
};

const PART_TYPE_OPTIONS = [
  { value: "text", label: "Text", icon: Type },
  { value: "url", label: "URL", icon: LinkIcon },
  { value: "data", label: "Data", icon: Database },
  { value: "file", label: "File", icon: FileText },
];

const TRUST_TIER_COLORS: Record<string, string> = {
  full: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  verified: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  basic: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20",
  untrusted: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
};

export default function TeamGraphEditor({ blueprintId }: TeamGraphEditorProps) {
  const { toast } = useToast();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeMode, setEdgeMode] = useState<string | null>(null);

  const graphQueryKey = ["/api/blueprints", blueprintId, "team-graph"];

  const { data: graphData, isLoading } = useQuery<{ nodes: TeamBlueprintNode[]; edges: TeamBlueprintEdge[] }>({
    queryKey: graphQueryKey,
    enabled: !!blueprintId,
  });

  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: remoteAgents } = useQuery<RemoteAgent[]>({ queryKey: ["/api/remote-agents"] });
  const { data: mcpTools } = useQuery<McpServerTool[]>({ queryKey: ["/api/mcp-tools"] });
  const { data: policies } = useQuery<Policy[]>({ queryKey: ["/api/policies"] });

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];

  const singleAgents = useMemo(() => (agents || []).filter(a => a.agentType === "single"), [agents]);

  const invalidateGraph = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: graphQueryKey });
  }, [blueprintId]);

  const createNodeMutation = useMutation({
    mutationFn: async (nodeType: string) => {
      const def = TEAM_NODE_TYPES.find(t => t.type === nodeType);
      await apiRequest("POST", "/api/team-blueprint-nodes", {
        blueprintId,
        nodeType,
        label: def?.label || nodeType,
        positionX: 0,
        positionY: nodes.length * 120,
      });
    },
    onSuccess: () => {
      invalidateGraph();
      toast({ title: "Node added" });
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

  const handleNodeClick = useCallback((nodeId: string) => {
    if (edgeMode === "__waiting__") {
      setEdgeMode(nodeId);
    } else if (edgeMode && edgeMode !== "__waiting__") {
      if (edgeMode !== nodeId) {
        const alreadyExists = edges.some(e => e.sourceNodeId === edgeMode && e.targetNodeId === nodeId);
        if (!alreadyExists) {
          createEdgeMutation.mutate({ sourceNodeId: edgeMode, targetNodeId: nodeId });
        }
      }
      setEdgeMode(null);
    } else {
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
    }
  }, [edgeMode, edges, createEdgeMutation]);

  const handleEdgeClick = useCallback((edgeId: string) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
  }, []);

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
          <Button
            variant={edgeMode ? "default" : "outline"}
            size="sm"
            className="w-full"
            onClick={() => {
              setEdgeMode(edgeMode ? null : "__waiting__");
              if (edgeMode) setEdgeMode(null);
            }}
            data-testid="button-add-edge-mode"
          >
            <Link2 className="w-3.5 h-3.5 mr-1.5" /> {edgeMode ? "Cancel Edge Mode" : "Add Edge"}
          </Button>
        </div>
      </div>

      {/* Center Panel - Graph Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {edgeMode && (
          <div className="flex items-center gap-2 p-2 bg-blue-500/10 border-b flex-wrap">
            <MousePointer className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs text-blue-600 dark:text-blue-400" data-testid="text-edge-mode">
              {edgeMode === "__waiting__" ? "Click a source node to start" : "Now click the target node"}
            </span>
          </div>
        )}
        <ScrollArea className="flex-1">
          <div className="p-6 flex flex-col items-center gap-0">
            {nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Brain className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground" data-testid="text-empty-canvas">Add team nodes from the palette to get started</p>
              </div>
            ) : (
              <>
                <svg className="absolute" width="0" height="0">
                  <defs>
                    <marker id="team-arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
                    </marker>
                  </defs>
                </svg>
                {nodes.map((node, idx) => {
                  const Icon = NODE_ICON_MAP[node.nodeType] || Brain;
                  const isSelected = selectedNodeId === node.id;
                  const isEdgeSource = edgeMode === node.id;
                  const incomingEdges = edges.filter(e => e.targetNodeId === node.id);
                  const refAgent = node.refAgentId ? (agents || []).find(a => a.id === node.refAgentId) : null;
                  const refRemoteAgent = node.refRemoteAgentId ? (remoteAgents || []).find(ra => ra.id === node.refRemoteAgentId) : null;
                  const toolCount = (node.refToolIds || []).length;

                  return (
                    <div key={node.id} className="flex flex-col items-center w-full max-w-md">
                      {incomingEdges.map(edge => {
                        const partTypes = edge.contentPartTypes || [];
                        const sla = edge.slaTimeoutMs;
                        const fm = edge.failureMode;
                        return (
                          <div key={`edge-${edge.id}`} className="flex flex-col items-center group cursor-pointer" onClick={() => handleEdgeClick(edge.id)}>
                            <svg width="2" height="40" className="overflow-visible">
                              <line x1="1" y1="0" x2="1" y2="40" stroke={selectedEdgeId === edge.id ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} strokeWidth={selectedEdgeId === edge.id ? 2 : 1.5} markerEnd="url(#team-arrowhead)" />
                            </svg>
                            <div className="flex items-center gap-1 -mt-1 mb-1 flex-wrap justify-center">
                              {partTypes.map(pt => (
                                <Badge key={pt} variant="outline" className="text-[9px] px-1 py-0" data-testid={`badge-part-type-${pt}`}>{pt}</Badge>
                              ))}
                              {sla != null && sla > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0" data-testid={`text-edge-sla-${edge.id}`}>{(sla / 1000).toFixed(0)}s SLA</Badge>
                              )}
                              {fm && fm !== "escalate" && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">{fm}</Badge>
                              )}
                            </div>
                            <button
                              className="invisible group-hover:visible -mt-1 mb-1 rounded-full bg-destructive text-destructive-foreground w-5 h-5 flex items-center justify-center text-xs"
                              onClick={(e) => { e.stopPropagation(); deleteEdgeMutation.mutate(edge.id); }}
                              data-testid={`button-delete-team-edge-${edge.id}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                      {idx > 0 && incomingEdges.length === 0 && <div className="h-4" />}
                      <Card
                        className={`w-full cursor-pointer ${isSelected ? "ring-2 ring-ring" : ""} ${isEdgeSource ? "ring-2 ring-blue-500" : ""}`}
                        onClick={() => handleNodeClick(node.id)}
                        data-testid={`card-team-node-${node.id}`}
                      >
                        <CardContent className="p-3 flex items-center gap-2.5 flex-wrap">
                          <div className={`w-1 h-6 rounded-full shrink-0 ${NODE_COLOR_MAP[node.nodeType] || "bg-gray-500"}`} />
                          <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium flex-1 truncate" data-testid={`text-node-label-${node.id}`}>{node.label}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{node.nodeType.replace("_", " ")}</Badge>
                          {node.nodeType === "internal_agent" && refAgent && (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-blue-500/10">{refAgent.name}</Badge>
                          )}
                          {node.nodeType === "remote_agent" && refRemoteAgent && (
                            <>
                              <Badge variant="outline" className={`text-[10px] shrink-0 ${TRUST_TIER_COLORS[refRemoteAgent.trustTier || "basic"] || ""}`}>
                                {refRemoteAgent.trustTier || "basic"}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {refRemoteAgent.connectivityStatus || "unknown"}
                              </Badge>
                            </>
                          )}
                          {node.nodeType === "tool_set" && toolCount > 0 && (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-500/10">{toolCount} tools</Badge>
                          )}
                          {node.nodeType === "edge_gate" && node.gateType && (
                            <Badge variant="outline" className="text-[10px] shrink-0 bg-orange-500/10">{node.gateType}</Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={e => { e.stopPropagation(); deleteNodeMutation.mutate(node.id); }}
                            data-testid={`button-delete-team-node-${node.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Config */}
      <div className="w-[320px] border-l shrink-0 flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-4 flex flex-col gap-4">
            {selectedNode ? (
              <NodeConfigPanel
                node={selectedNode}
                singleAgents={singleAgents}
                remoteAgents={remoteAgents || []}
                mcpTools={mcpTools || []}
                policies={policies || []}
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
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <MousePointer className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground text-center" data-testid="text-no-selection">Select a node or edge to configure</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function NodeConfigPanel({
  node,
  singleAgents,
  remoteAgents,
  mcpTools,
  policies,
  onUpdate,
  isPending,
}: {
  node: TeamBlueprintNode;
  singleAgents: Agent[];
  remoteAgents: RemoteAgent[];
  mcpTools: McpServerTool[];
  policies: Policy[];
  onUpdate: (updates: Partial<TeamBlueprintNode>) => void;
  isPending: boolean;
}) {
  const [localLabel, setLocalLabel] = useState(node.label);

  const prevNodeId = useMemo(() => node.id, [node.id]);
  if (localLabel !== node.label && prevNodeId === node.id) {
    // label changed from server, don't override
  }
  // Reset local label when node changes
  const [trackedNodeId, setTrackedNodeId] = useState(node.id);
  if (trackedNodeId !== node.id) {
    setTrackedNodeId(node.id);
    setLocalLabel(node.label);
  }

  const selectedAgent = node.refAgentId ? singleAgents.find(a => a.id === node.refAgentId) : null;
  const selectedRemoteAgent = node.refRemoteAgentId ? remoteAgents.find(ra => ra.id === node.refRemoteAgentId) : null;
  const selectedPolicy = node.refPolicyId ? policies.find(p => p.id === node.refPolicyId) : null;
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
          onBlur={() => { if (localLabel !== node.label) onUpdate({ label: localLabel }); }}
          data-testid="input-node-label"
        />
      </div>

      {node.nodeType === "internal_agent" && (
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
    </>
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

  const [trackedEdgeId, setTrackedEdgeId] = useState(edge.id);
  if (trackedEdgeId !== edge.id) {
    setTrackedEdgeId(edge.id);
    setLocalLabel(edge.label || "");
    setLocalMetadata(JSON.stringify(edge.allowedMetadata || {}, null, 2));
    setLocalRetryPolicy(JSON.stringify(edge.retryPolicy || { maxRetries: 3, backoffMs: 1000 }, null, 2));
    setLocalCondition(edge.condition || "");
    setLocalSla(edge.slaTimeoutMs != null ? String(edge.slaTimeoutMs) : "");
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
        <label className="text-xs font-medium text-muted-foreground">Condition</label>
        <Input
          value={localCondition}
          onChange={e => setLocalCondition(e.target.value)}
          onBlur={() => { if (localCondition !== (edge.condition || "")) onUpdate({ condition: localCondition || null }); }}
          placeholder='e.g. output.confidence > 0.8'
          data-testid="input-edge-condition"
        />
      </div>

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
