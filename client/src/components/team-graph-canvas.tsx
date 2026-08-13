import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  useReactFlow, Handle, Position,
  type Node as RFNode, type Edge as RFEdge, type Connection, type NodeProps, type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Brain, Network, Sparkles, Database, AlertTriangle, X, SquareFunction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { TeamBlueprintNode, TeamBlueprintEdge, Agent, RemoteAgent, Skill, KnowledgeBase } from "@shared/schema";
import { NODE_COLOR_MAP, NODE_ICON_MAP, TRUST_TIER_COLORS } from "@/lib/team-graph-node-meta";

const COL_WIDTH = 280;
const ROW_HEIGHT = 120;

interface ComputedWavePlan {
  totalWaves: number;
  maxParallelism: number;
  waves: Array<{ wave_number: number; nodes: string[] }>;
}

/** Wave-based layout when a computable plan exists (real branch structure,
 *  wave = x column), falling back to a simple grid -- same shape as
 *  flow-graph-canvas.tsx's addNode grid -- when there's no teamAgentId yet,
 *  the graph is empty, or dag-waves 500s (e.g. a cycle). */
async function computeAutoLayout(
  teamAgentId: string | undefined,
  nodes: TeamBlueprintNode[],
): Promise<Record<string, { x: number; y: number }>> {
  if (teamAgentId) {
    try {
      const res = await apiRequest("GET", `/api/team-agents/${teamAgentId}/dag-waves`);
      const plan: ComputedWavePlan = await res.json();
      const positions: Record<string, { x: number; y: number }> = {};
      plan.waves.forEach(wave => {
        wave.nodes.forEach((nodeId, row) => {
          positions[nodeId] = { x: (wave.wave_number - 1) * COL_WIDTH, y: row * ROW_HEIGHT };
        });
      });
      if (Object.keys(positions).length > 0) return positions;
    } catch {
      // Cycle detected (500), network error, agent not found yet -- fall through to grid.
    }
  }
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => { positions[n.id] = { x: (i % 5) * COL_WIDTH, y: Math.floor(i / 5) * ROW_HEIGHT }; });
  return positions;
}

interface TeamNodeRFData {
  node: TeamBlueprintNode;
  displayLabel: string;
  hasStateKeyConflict: boolean;
  refAgentName?: string;
  refTeamAgentName?: string;
  refRemoteAgent?: { name: string; trustTier: string | null; connectivityStatus: string | null };
  refSkillName?: string;
  refKbName?: string;
  toolCount: number;
  onDelete: (nodeId: string) => void;
  [key: string]: unknown;
}

function TeamFlowNode({ data, selected }: NodeProps) {
  const d = data as unknown as TeamNodeRFData;
  const { node } = d;
  const Icon = NODE_ICON_MAP[node.nodeType] || Brain;

  return (
    <Card
      className={`w-64 cursor-pointer ${selected ? "ring-2 ring-ring" : ""}`}
      data-testid={`card-team-node-${node.id}`}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground" />
      <CardContent className="p-3 flex items-center gap-2.5 flex-wrap">
        <div className={`w-1 h-6 rounded-full shrink-0 ${NODE_COLOR_MAP[node.nodeType] || "bg-gray-500"}`} />
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1 truncate" data-testid={`text-node-label-${node.id}`}>{d.displayLabel}</span>
        <Badge variant="outline" className="text-[10px] shrink-0">{node.nodeType.replace("_", " ")}</Badge>
        {node.nodeType === "internal_agent" && d.refAgentName && !node.refTeamAgentId && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-blue-500/10">{d.refAgentName}</Badge>
        )}
        {node.nodeType === "internal_agent" && node.refTeamAgentId && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300 flex items-center gap-1" data-testid={`badge-team-ref-${node.id}`}>
            <Network className="w-2.5 h-2.5" />{d.refTeamAgentName || "Team Ref"}
          </Badge>
        )}
        {node.nodeType === "sub_flow" && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300 flex items-center gap-1" data-testid={`badge-sub-flow-${node.id}`}>
            <Network className="w-2.5 h-2.5" />{d.refTeamAgentName || "Not configured"}
          </Badge>
        )}
        {node.nodeType === "expression" && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300 flex items-center gap-1 font-mono max-w-[160px] truncate" data-testid={`badge-expression-${node.id}`}>
            <SquareFunction className="w-2.5 h-2.5 shrink-0" />{(node.config as any)?.expression || "Not configured"}
          </Badge>
        )}
        {node.nodeType === "remote_agent" && d.refRemoteAgent && (
          <>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${TRUST_TIER_COLORS[d.refRemoteAgent.trustTier || "basic"] || ""}`}>
              {d.refRemoteAgent.trustTier || "basic"}
            </Badge>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {d.refRemoteAgent.connectivityStatus || "unknown"}
            </Badge>
          </>
        )}
        {node.nodeType === "tool_set" && d.toolCount > 0 && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-amber-500/10">{d.toolCount} tools</Badge>
        )}
        {node.nodeType === "edge_gate" && node.gateType && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-orange-500/10">{node.gateType}</Badge>
        )}
        {node.nodeType === "skill" && d.refSkillName && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-teal-500/10 border-teal-500/30 text-teal-700 dark:text-teal-300 flex items-center gap-1" data-testid={`badge-skill-ref-${node.id}`}>
            <Sparkles className="w-2.5 h-2.5" />{d.refSkillName}
          </Badge>
        )}
        {node.nodeType === "knowledge_base" && d.refKbName && (
          <Badge variant="outline" className="text-[10px] shrink-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-1" data-testid={`badge-kb-ref-${node.id}`}>
            <Database className="w-2.5 h-2.5" />{d.refKbName}
          </Badge>
        )}
        {d.hasStateKeyConflict && (
          <Badge variant="outline" className="text-[9px] shrink-0 text-amber-600 border-amber-500/40 bg-amber-500/10 flex items-center gap-0.5 px-1" data-testid={`badge-canvas-state-key-conflict-${node.id}`}>
            <AlertTriangle className="w-2.5 h-2.5" /> key conflict
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={e => { e.stopPropagation(); d.onDelete(node.id); }}
          data-testid={`button-delete-team-node-${node.id}`}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </CardContent>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </Card>
  );
}

const nodeTypes = { team_node: TeamFlowNode };

interface TeamGraphCanvasProps {
  blueprintId: string;
  teamAgentId?: string;
  nodes: TeamBlueprintNode[];
  edges: TeamBlueprintEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  stateKeyConflictIds: Set<string>;
  getNodeDisplayLabel: (node: TeamBlueprintNode) => string;
  agents: Agent[];
  remoteAgents: RemoteAgent[];
  skills: Skill[];
  knowledgeBases: KnowledgeBase[];
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onPaneClick: () => void;
  onConnect: (sourceNodeId: string, targetNodeId: string) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onNodeDelete: (nodeId: string) => void;
}

function Canvas({
  teamAgentId, nodes, edges, selectedNodeId, selectedEdgeId, stateKeyConflictIds,
  getNodeDisplayLabel, agents, remoteAgents, skills, knowledgeBases,
  onNodeSelect, onEdgeSelect, onPaneClick, onConnect, onNodeDragStop, onNodeDelete,
}: TeamGraphCanvasProps) {
  const { fitView } = useReactFlow();
  // Never-arranged heuristic: createNodeMutation always writes positionX: 0,
  // so "every node still at x=0" reliably means nobody has dragged anything
  // in this canvas yet (true for both legacy vertical-stack data and brand
  // new graphs). Once true, we compute a wave-based layout for DISPLAY only
  // -- see the useQuery below -- and never write it back except in response
  // to an actual drag (handleDragStop).
  const neverArranged = nodes.length > 0 && nodes.every(n => (n.positionX ?? 0) === 0);

  const { data: layoutPositions = {} } = useQuery({
    queryKey: ["team-graph-autolayout", teamAgentId, nodes.map(n => n.id).sort().join(",")],
    queryFn: () => computeAutoLayout(teamAgentId, nodes),
    enabled: neverArranged,
  });

  // Transient in-flight drag position, scoped purely to smooth visual
  // movement during a drag -- never read by anything outside this canvas
  // (NodeConfigPanel/EdgeConfigPanel keep reading the server-fetched `nodes`
  // prop, not this). Cleared once the drag ends and the real mutation's
  // invalidated refetch lands.
  const [dragOverlay, setDragOverlay] = useState<Record<string, { x: number; y: number }>>({});
  const fittedRef = useRef(false);

  const resolvePosition = useCallback((node: TeamBlueprintNode) => {
    if (dragOverlay[node.id]) return dragOverlay[node.id];
    if (neverArranged && layoutPositions[node.id]) return layoutPositions[node.id];
    return { x: node.positionX ?? 0, y: node.positionY ?? 0 };
  }, [dragOverlay, neverArranged, layoutPositions]);

  const rfNodes: RFNode[] = useMemo(() => nodes.map(node => {
    const refAgent = node.refAgentId ? agents.find(a => a.id === node.refAgentId) : null;
    const refTeamAgent = node.refTeamAgentId ? agents.find(a => a.id === node.refTeamAgentId) : null;
    const refRemote = node.refRemoteAgentId ? remoteAgents.find(ra => ra.id === node.refRemoteAgentId) : null;
    const refSkill = (node as any).refSkillId ? skills.find(s => s.id === (node as any).refSkillId) : null;
    const refKb = (node as any).refKnowledgeBaseId ? knowledgeBases.find(k => k.id === (node as any).refKnowledgeBaseId) : null;

    const data: TeamNodeRFData = {
      node,
      displayLabel: getNodeDisplayLabel(node),
      hasStateKeyConflict: stateKeyConflictIds.has(node.id),
      refAgentName: refAgent?.name,
      refTeamAgentName: refTeamAgent?.name,
      refRemoteAgent: refRemote ? { name: refRemote.agentId ? (agents.find(a => a.id === refRemote.agentId)?.name || refRemote.id) : refRemote.id, trustTier: refRemote.trustTier, connectivityStatus: refRemote.connectivityStatus } : undefined,
      refSkillName: refSkill?.name,
      refKbName: refKb?.name,
      toolCount: (node.refToolIds || []).length,
      onDelete: onNodeDelete,
    };

    const pos = resolvePosition(node);
    return {
      id: node.id,
      type: "team_node",
      position: pos,
      selected: node.id === selectedNodeId,
      // Anchor edge paths explicitly rather than relying on runtime handle-
      // bounds registration timing -- the documented fix for edges silently
      // not rendering against custom node types.
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: data as unknown as Record<string, unknown>,
      // React Flow can't route an edge to/from an unmeasured node -- give it
      // an immediate box so edges render on first paint instead of silently
      // missing until the ResizeObserver catches up (bit flow-graph-canvas.tsx
      // before; nodes+edges land together here on every mutation refetch).
      initialWidth: 256,
      initialHeight: 88,
    };
  }), [nodes, agents, remoteAgents, skills, knowledgeBases, getNodeDisplayLabel, stateKeyConflictIds, selectedNodeId, resolvePosition, onNodeDelete]);

  const rfEdges: RFEdge[] = useMemo(() => edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    label: edge.label || undefined,
    animated: !!edge.condition,
    selected: edge.id === selectedEdgeId,
    style: {
      stroke: edge.id === selectedEdgeId ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
      strokeWidth: edge.id === selectedEdgeId ? 2 : 1.5,
    },
  })), [edges, selectedEdgeId]);

  // Scoped to position/select changes only -- node/edge existence is
  // mutation-driven (see onConnect/onNodeDelete/onEdgeDelete below), so we
  // deliberately never apply a "remove" change here. That keeps React Flow's
  // own Backspace-key shortcut from firing an unguarded local deletion that
  // could race the server round-trip.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter(c => c.type === "position");
    if (positionChanges.length === 0) return;
    setDragOverlay(prev => {
      const next = { ...prev };
      for (const c of positionChanges as any[]) {
        if (c.position) next[c.id] = c.position;
      }
      return next;
    });
  }, []);

  const handleConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const alreadyExists = edges.some(e => e.sourceNodeId === c.source && e.targetNodeId === c.target);
    if (alreadyExists) return;
    onConnect(c.source, c.target);
  }, [edges, onConnect]);

  const handleDragStop = useCallback((_: unknown, dragged: RFNode) => {
    const x = Math.round(dragged.position.x);
    const y = Math.round(dragged.position.y);
    if (neverArranged) {
      // First real drag on a never-arranged canvas: persist every node's
      // CURRENTLY DISPLAYED position (the wave layout for untouched nodes,
      // the just-dropped spot for this one) in one shot, triggered by this
      // one explicit user action -- not on page load. Without this, any
      // node the user hasn't personally dragged would fall back to its raw
      // stored (0,0)-ish position the moment this graph stops being
      // "never arranged", visually colliding at the origin.
      for (const n of nodes) {
        const pos = n.id === dragged.id ? { x, y } : resolvePosition(n);
        onNodeDragStop(n.id, Math.round(pos.x), Math.round(pos.y));
      }
    } else {
      onNodeDragStop(dragged.id, x, y);
    }
  }, [neverArranged, nodes, resolvePosition, onNodeDragStop]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Brain className="w-10 h-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground" data-testid="text-empty-canvas">Add team nodes from the palette to get started</p>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={handleConnect}
      onNodeDragStop={handleDragStop}
      onNodeClick={(_, n) => onNodeSelect(n.id)}
      onEdgeClick={(_, e) => onEdgeSelect(e.id)}
      onPaneClick={onPaneClick}
      onInit={() => {
        if (!fittedRef.current) { fittedRef.current = true; fitView({ padding: 0.2 }); }
      }}
      fitView
      proOptions={{ hideAttribution: true }}
      data-testid="reactflow-team-canvas"
    >
      <Background />
      <Controls />
    </ReactFlow>
  );
}

export default function TeamGraphCanvas(props: TeamGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
