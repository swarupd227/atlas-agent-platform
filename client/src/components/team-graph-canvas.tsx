import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls,
  useReactFlow, Handle, Position,
  type Node as RFNode, type Edge as RFEdge, type Connection, type NodeProps, type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Brain, Network, Sparkles, Database, AlertTriangle, X, SquareFunction } from "lucide-react";
import type { TeamBlueprintNode, TeamBlueprintEdge, RemoteAgent, Skill, KnowledgeBase } from "@shared/schema";
import { NODE_COLOR_MAP, NODE_ICON_MAP } from "@/lib/team-graph-node-meta";

export const COL_WIDTH = 300;
export const ROW_HEIGHT = 124;
const NODE_W = 244;
const HEAD_H = 56;

/** The run order the engine computes: stage (wave) number -> the steps that run in it. */
export interface WavePlan {
  totalWaves: number;
  maxParallelism: number;
  waves: Array<{ wave_number: number; nodes: string[] }>;
}

/** Stage columns, each column's steps stacked and centred on the tallest column. */
export function stageLayout(plan: WavePlan | undefined, nodes: TeamBlueprintNode[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  if (plan?.waves?.length) {
    const tallest = Math.max(...plan.waves.map((w) => w.nodes.length));
    plan.waves.forEach((wave) => {
      const offset = ((tallest - wave.nodes.length) * ROW_HEIGHT) / 2;
      wave.nodes.forEach((nodeId, row) => {
        positions[nodeId] = { x: (wave.wave_number - 1) * COL_WIDTH, y: HEAD_H + offset + row * ROW_HEIGHT };
      });
    });
  }
  // Anything the plan doesn't place (a new, unconnected step) goes in a row underneath.
  const placedRows = plan?.waves?.length ? Math.max(...plan.waves.map((w) => w.nodes.length)) : 0;
  nodes.filter((n) => !positions[n.id]).forEach((n, i) => {
    positions[n.id] = { x: i * COL_WIDTH, y: HEAD_H + (placedRows + 0.5) * ROW_HEIGHT };
  });
  return positions;
}

const KIND_LABEL: Record<string, string> = {
  internal_agent: "Agent", tool_set: "Tool set", edge_gate: "Person approves", remote_agent: "Remote agent",
  skill: "Skill", knowledge_base: "Knowledge", sub_flow: "Sub-flow", expression: "Expression",
};

export interface StepMeta {
  agentName?: string;
  model?: string;
  lastRun?: { status: string; durationMs?: number | null };
}

interface TeamNodeRFData {
  node: TeamBlueprintNode;
  displayLabel: string;
  hasStateKeyConflict: boolean;
  meta: StepMeta;
  refTeamAgentName?: string;
  refRemoteAgent?: { trustTier: string | null; connectivityStatus: string | null };
  refSkillName?: string;
  refKbName?: string;
  toolCount: number;
  onDelete: (nodeId: string) => void;
  [key: string]: unknown;
}

const fmtDuration = (ms?: number | null) => (!ms ? "" : ms < 60000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}s`);

function TeamFlowNode({ data, selected }: NodeProps) {
  const d = data as unknown as TeamNodeRFData;
  const { node, meta } = d;
  const Icon = NODE_ICON_MAP[node.nodeType] || Brain;
  const isGate = node.nodeType === "edge_gate";

  // One line under the name that says what this step is bound to.
  const detail =
    node.nodeType === "internal_agent" && node.refTeamAgentId ? d.refTeamAgentName || "another team"
    : node.nodeType === "internal_agent" ? [d.toolCount ? `${d.toolCount} tool${d.toolCount !== 1 ? "s" : ""}` : "", meta.model?.replace(/^claude-/, "")].filter(Boolean).join(" · ") || meta.agentName || "no agent chosen"
    : node.nodeType === "sub_flow" ? d.refTeamAgentName || "not configured"
    : node.nodeType === "expression" ? (node.config as any)?.expression || "not configured"
    : node.nodeType === "tool_set" ? `${d.toolCount} tool${d.toolCount !== 1 ? "s" : ""}`
    : node.nodeType === "edge_gate" ? (node.gateType === "approval" || !node.gateType ? "any approver" : node.gateType.replace(/_/g, " "))
    : node.nodeType === "skill" ? d.refSkillName || "no skill chosen"
    : node.nodeType === "knowledge_base" ? d.refKbName || "no knowledge base chosen"
    : node.nodeType === "remote_agent" ? `${d.refRemoteAgent?.trustTier || "basic"} · ${d.refRemoteAgent?.connectivityStatus || "unknown"}`
    : "";

  return (
    <div
      className={`group relative rounded-[10px] border bg-card px-3 py-2.5 text-card-foreground ${
        selected ? "border-foreground shadow-[0_0_0_3px_hsl(var(--ring)/0.45)]"
        : isGate ? "border-[hsl(350_60%_48%/0.45)] shadow-sm hover:border-foreground/50"
        : "shadow-sm hover:border-foreground/50"
      }`}
      style={{ width: NODE_W }}
      data-testid={`card-team-node-${node.id}`}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-foreground/60 !border-background" />
      <div className="flex items-center gap-1.5">
        <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] text-white ${NODE_COLOR_MAP[node.nodeType] || "bg-slate-500"}`}>
          <Icon className="h-3 w-3" />
        </span>
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{KIND_LABEL[node.nodeType] || node.nodeType}</span>
        {d.hasStateKeyConflict && (
          <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-amber-600" title="Two steps write the same state key" data-testid={`badge-canvas-state-key-conflict-${node.id}`}>
            <AlertTriangle className="h-3 w-3" /> key conflict
          </span>
        )}
        <button
          type="button"
          className={`${d.hasStateKeyConflict ? "" : "ml-auto"} rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100`}
          onClick={(e) => { e.stopPropagation(); d.onDelete(node.id); }}
          aria-label="Remove step"
          data-testid={`button-delete-team-node-${node.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={d.displayLabel} data-testid={`text-node-label-${node.id}`}>{d.displayLabel}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
        {node.nodeType === "sub_flow" || node.refTeamAgentId ? <Network className="h-3 w-3 shrink-0" />
          : node.nodeType === "skill" ? <Sparkles className="h-3 w-3 shrink-0" />
          : node.nodeType === "knowledge_base" ? <Database className="h-3 w-3 shrink-0" />
          : node.nodeType === "expression" ? <SquareFunction className="h-3 w-3 shrink-0" /> : null}
        <span className="truncate">{detail}</span>
      </p>
      {meta.lastRun && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.lastRun.status === "completed" ? "bg-emerald-500" : meta.lastRun.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
          last run {fmtDuration(meta.lastRun.durationMs) || meta.lastRun.status}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-foreground !border-background" />
    </div>
  );
}

function StageLabel({ data }: NodeProps) {
  const d = data as { title: string; sub: string };
  return (
    <div className="pointer-events-none text-center" style={{ width: NODE_W }}>
      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{d.title}</p>
      <p className="text-[11.5px] text-muted-foreground">{d.sub}</p>
    </div>
  );
}

const nodeTypes = { team_node: TeamFlowNode, stage_label: StageLabel };

interface TeamGraphCanvasProps {
  blueprintId: string;
  teamAgentId?: string;
  nodes: TeamBlueprintNode[];
  edges: TeamBlueprintEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  stateKeyConflictIds: Set<string>;
  getNodeDisplayLabel: (node: TeamBlueprintNode) => string;
  /** Per-step facts: agent name, model and the last run's result. */
  stepMeta: Record<string, StepMeta>;
  teamNames: Record<string, string>;
  remoteAgents: RemoteAgent[];
  skills: Skill[];
  knowledgeBases: KnowledgeBase[];
  wavePlan?: WavePlan;
  /** Business view hides links that skip a stage; technical view shows them faintly. */
  businessView?: boolean;
  /** Changes whenever the canvas area resizes (panel, full screen), so the view re-fits. */
  fitKey?: string;
  onNodeSelect: (nodeId: string) => void;
  onEdgeSelect: (edgeId: string) => void;
  onPaneClick: () => void;
  onConnect: (sourceNodeId: string, targetNodeId: string) => void;
  onNodeDragStop: (nodeId: string, x: number, y: number) => void;
  onNodeDelete: (nodeId: string) => void;
}

function Canvas({
  nodes, edges, selectedNodeId, selectedEdgeId, stateKeyConflictIds, getNodeDisplayLabel,
  stepMeta, teamNames, remoteAgents, skills, knowledgeBases, wavePlan, businessView, fitKey,
  onNodeSelect, onEdgeSelect, onPaneClick, onConnect, onNodeDragStop, onNodeDelete,
}: TeamGraphCanvasProps) {
  const { fitView } = useReactFlow();
  // Every node still at x=0 means nobody has arranged this canvas yet (new steps are created at
  // x=0), so show the stage layout. Nothing is written back until an explicit drag or "Tidy up".
  const neverArranged = nodes.length > 0 && nodes.every((n) => (n.positionX ?? 0) === 0);
  const layoutPositions = useMemo(() => (neverArranged ? stageLayout(wavePlan, nodes) : {}), [neverArranged, wavePlan, nodes]);

  // In-flight drag positions, for smooth movement only; cleared by the refetch after the save.
  const [dragOverlay, setDragOverlay] = useState<Record<string, { x: number; y: number }>>({});

  const resolvePosition = useCallback((node: TeamBlueprintNode) => {
    if (dragOverlay[node.id]) return dragOverlay[node.id];
    if (neverArranged && layoutPositions[node.id]) return layoutPositions[node.id];
    return { x: node.positionX ?? 0, y: node.positionY ?? 0 };
  }, [dragOverlay, neverArranged, layoutPositions]);

  const waveOf = useMemo(() => {
    const m: Record<string, number> = {};
    wavePlan?.waves?.forEach((w) => w.nodes.forEach((id) => (m[id] = w.wave_number)));
    return m;
  }, [wavePlan]);

  const rfNodes: RFNode[] = useMemo(() => {
    const steps: RFNode[] = nodes.map((node) => {
      const refRemote = node.refRemoteAgentId ? remoteAgents.find((ra) => ra.id === node.refRemoteAgentId) : null;
      const refSkill = (node as any).refSkillId ? skills.find((s) => s.id === (node as any).refSkillId) : null;
      const refKb = (node as any).refKnowledgeBaseId ? knowledgeBases.find((k) => k.id === (node as any).refKnowledgeBaseId) : null;
      const data: TeamNodeRFData = {
        node,
        displayLabel: getNodeDisplayLabel(node),
        hasStateKeyConflict: stateKeyConflictIds.has(node.id),
        meta: stepMeta[node.id] || {},
        refTeamAgentName: node.refTeamAgentId ? teamNames[node.refTeamAgentId] : undefined,
        refRemoteAgent: refRemote ? { trustTier: refRemote.trustTier, connectivityStatus: refRemote.connectivityStatus } : undefined,
        refSkillName: refSkill?.name,
        refKbName: refKb?.name,
        toolCount: (node.refToolIds || []).length,
        onDelete: onNodeDelete,
      };
      return {
        id: node.id,
        type: "team_node",
        position: resolvePosition(node),
        selected: node.id === selectedNodeId,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: data as unknown as Record<string, unknown>,
        // An immediate box so edges route on first paint, before React Flow measures the node.
        initialWidth: NODE_W,
        initialHeight: 92,
      };
    });
    // Stage headings, only while the stage layout is what's on screen.
    if (neverArranged && wavePlan?.waves?.length) {
      for (const w of wavePlan.waves) {
        const only = w.nodes.length === 1 ? nodes.find((n) => n.id === w.nodes[0]) : undefined;
        steps.push({
          id: `stage-${w.wave_number}`,
          type: "stage_label",
          position: { x: (w.wave_number - 1) * COL_WIDTH, y: 0 },
          draggable: false,
          selectable: false,
          connectable: false,
          data: {
            title: `Stage ${w.wave_number}`,
            sub: w.nodes.length > 1 ? `${w.nodes.length} side by side` : only?.nodeType === "edge_gate" ? "a person decides" : "one step",
          },
        });
      }
    }
    return steps;
  }, [nodes, remoteAgents, skills, knowledgeBases, getNodeDisplayLabel, stateKeyConflictIds, stepMeta, teamNames, selectedNodeId, resolvePosition, onNodeDelete, neverArranged, wavePlan]);

  const rfEdges: RFEdge[] = useMemo(() => edges.flatMap((edge) => {
    const a = waveOf[edge.sourceNodeId], b = waveOf[edge.targetNodeId];
    // A link that skips over a stage adds nothing to reading the flow: the step already gets
    // everything upstream. Hidden in business view, faint in technical view, still editable there.
    const skips = a !== undefined && b !== undefined && b > a + 1;
    if (skips && businessView && edge.id !== selectedEdgeId) return [];
    const hot = edge.id === selectedEdgeId || edge.sourceNodeId === selectedNodeId || edge.targetNodeId === selectedNodeId;
    return [{
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      // Link names only on the links of the selected step: at full density they pile up where links cross.
      label: hot ? edge.label || undefined : undefined,
      animated: !!edge.condition,
      selected: edge.id === selectedEdgeId,
      style: {
        stroke: hot ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
        strokeWidth: edge.id === selectedEdgeId ? 2.5 : hot ? 1.8 : 1.4,
        opacity: skips && !hot ? 0.18 : hot ? 1 : 0.65,
        strokeDasharray: skips ? "4 4" : undefined,
      },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" },
      labelBgStyle: { fill: "hsl(var(--card))", stroke: "hsl(var(--border))", strokeWidth: 1 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
    }];
  }), [edges, selectedEdgeId, selectedNodeId, waveOf, businessView]);

  // Position changes only: steps and links are created and removed through the server.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionChanges = changes.filter((c) => c.type === "position" && !String((c as any).id).startsWith("stage-"));
    if (positionChanges.length === 0) return;
    setDragOverlay((prev) => {
      const next = { ...prev };
      for (const c of positionChanges as any[]) if (c.position) next[c.id] = c.position;
      return next;
    });
  }, []);

  const handleConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    if (edges.some((e) => e.sourceNodeId === c.source && e.targetNodeId === c.target)) return;
    onConnect(c.source, c.target);
  }, [edges, onConnect]);

  const handleDragStop = useCallback((_: unknown, dragged: RFNode) => {
    if (dragged.type === "stage_label") return;
    const x = Math.round(dragged.position.x);
    const y = Math.round(dragged.position.y);
    if (neverArranged) {
      // The first drag fixes every step where it is on screen now, so untouched steps don't
      // fall back to their stored (0,0) once the canvas counts as arranged.
      for (const n of nodes) {
        const pos = n.id === dragged.id ? { x, y } : resolvePosition(n);
        onNodeDragStop(n.id, Math.round(pos.x), Math.round(pos.y));
      }
    } else {
      onNodeDragStop(dragged.id, x, y);
    }
  }, [neverArranged, nodes, resolvePosition, onNodeDragStop]);

  // Re-fit when the canvas area changes size or the layout switches.
  const firstFit = useRef(true);
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.12, duration: firstFit.current ? 0 : 250, maxZoom: 1.1 }), 60);
    firstFit.current = false;
    return () => clearTimeout(t);
  }, [fitKey, neverArranged, wavePlan, nodes.length, fitView]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <Brain className="h-9 w-9 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground" data-testid="text-empty-canvas">Add steps from the left to start the flow</p>
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
      onNodeClick={(_, n) => { if (n.type !== "stage_label") onNodeSelect(n.id); }}
      onEdgeClick={(_, e) => onEdgeSelect(e.id)}
      onPaneClick={onPaneClick}
      fitView
      fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
      data-testid="reactflow-team-canvas"
    >
      <Background color="hsl(var(--foreground) / 0.18)" gap={18} size={1.2} />
      <Controls showInteractive={false} className="!shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground" />
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
