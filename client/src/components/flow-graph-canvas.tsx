import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Handle, Position,
  type Node as RFNode, type Edge as RFEdge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Database, Brain, GitBranch, UserCheck, Zap, Bell, GitFork, RotateCcw, Square,
  Trash2, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ProcessNode, ProcessEdge, ProcessNodeType } from "@shared/process-flow";

type NodeMeta = { label: string; icon: any; color: string; bg: string; border: string };
const NODE_META: Record<ProcessNodeType, NodeMeta> = {
  trigger:           { label: "Trigger",      icon: Play,     color: "text-sky-600",     bg: "bg-sky-500/5",     border: "border-sky-500/40" },
  get_info:          { label: "Get Info",     icon: Database, color: "text-cyan-600",    bg: "bg-cyan-500/5",    border: "border-cyan-500/40" },
  ai_reasoning:      { label: "AI Reasoning", icon: Brain,    color: "text-violet-600",  bg: "bg-violet-500/5",  border: "border-violet-500/40" },
  make_decision:     { label: "Decision",     icon: GitBranch,color: "text-amber-600",   bg: "bg-amber-500/5",   border: "border-amber-500/40" },
  expert_approval:   { label: "Approval",     icon: UserCheck,color: "text-rose-600",    bg: "bg-rose-500/5",    border: "border-rose-500/40" },
  take_action:       { label: "Action",       icon: Zap,      color: "text-emerald-600", bg: "bg-emerald-500/5", border: "border-emerald-500/40" },
  send_notification: { label: "Notify",       icon: Bell,     color: "text-blue-600",    bg: "bg-blue-500/5",    border: "border-blue-500/40" },
  parallel:          { label: "Parallel",     icon: GitFork,  color: "text-indigo-600",  bg: "bg-indigo-500/5",  border: "border-indigo-500/40" },
  loop:              { label: "Loop / Retry", icon: RotateCcw,color: "text-orange-600",  bg: "bg-orange-500/5",  border: "border-orange-500/40" },
  end:               { label: "End",          icon: Square,   color: "text-slate-600",   bg: "bg-slate-500/5",   border: "border-slate-500/40" },
};

export const PALETTE_TYPES: ProcessNodeType[] = [
  "trigger", "get_info", "ai_reasoning", "make_decision",
  "expert_approval", "take_action", "send_notification", "parallel", "loop", "end",
];

type RFData = { ntype: ProcessNodeType; label: string; description?: string; actor?: string };

function ProcessFlowNode({ data, selected }: NodeProps) {
  const d = data as RFData;
  const meta = NODE_META[d.ntype] || NODE_META.take_action;
  const Icon = meta.icon;
  return (
    <div className={`rounded-xl border ${meta.border} ${meta.bg} px-3 py-2 w-44 shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-muted-foreground" />
      <div className={`flex items-center gap-1.5 mb-1 ${meta.color}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[9px] font-semibold uppercase tracking-wide truncate">{meta.label}</span>
      </div>
      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">{d.label || "Untitled"}</p>
      {d.actor && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{d.actor}</p>}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </div>
  );
}

const nodeTypes = { process: ProcessFlowNode };

function toRFNodes(nodes: ProcessNode[]): RFNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: "process",
    position: n.position && (n.position.x || n.position.y) ? n.position : { x: (i % 5) * 240, y: Math.floor(i / 5) * 140 },
    data: { ntype: n.type, label: n.label, description: n.description, actor: n.actor } as RFData,
  }));
}
function toRFEdges(edges: ProcessEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id || `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.label,
    data: { condition: e.condition },
    animated: !!e.condition,
  }));
}
function fromRF(nodes: RFNode[], edges: RFEdge[]): { nodes: ProcessNode[]; edges: ProcessEdge[] } {
  return {
    nodes: nodes.map(n => {
      const d = n.data as RFData;
      return { id: n.id, type: d.ntype, label: d.label, description: d.description, actor: d.actor, position: n.position, estimatedMins: undefined } as ProcessNode;
    }),
    edges: edges.map(e => ({ id: e.id, from: e.source, to: e.target, label: e.label as string | undefined, condition: (e.data as any)?.condition })),
  };
}

let _idc = 0;
const newId = () => `n_${Date.now().toString(36)}_${_idc++}`;

interface Props {
  /** Remount key — change to reset the canvas to a fresh graph (e.g. new outcome). */
  flowKey: string;
  initialNodes: ProcessNode[];
  initialEdges: ProcessEdge[];
  onChange: (nodes: ProcessNode[], edges: ProcessEdge[]) => void;
}

function Canvas({ initialNodes, initialEdges, onChange }: Omit<Props, "flowKey">) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(toRFNodes(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(toRFEdges(initialEdges));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Propagate any change up to the parent (graph is the source of truth there).
  useEffect(() => {
    const g = fromRF(nodes, edges);
    onChange(g.nodes, g.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onConnect = useCallback((c: Connection) => {
    setEdges(eds => addEdge({ ...c, id: `e_${newId()}` }, eds));
  }, [setEdges]);

  const addNode = useCallback((ntype: ProcessNodeType) => {
    const id = newId();
    const count = nodes.length;
    setNodes(nds => nds.concat({
      id, type: "process",
      position: { x: (count % 5) * 240, y: Math.floor(count / 5) * 140 + 40 },
      data: { ntype, label: NODE_META[ntype].label, description: "", actor: "" } as RFData,
    }));
    setSelectedNodeId(id);
  }, [nodes.length, setNodes]);

  const patchNode = useCallback((id: string, patch: Partial<RFData>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...(n.data as RFData), ...patch } } : n));
  }, [setNodes]);
  const patchEdge = useCallback((id: string, patch: { label?: string; condition?: string }) => {
    setEdges(eds => eds.map(e => e.id === id ? {
      ...e,
      label: patch.label !== undefined ? patch.label : e.label,
      data: { ...(e.data as any), ...(patch.condition !== undefined ? { condition: patch.condition } : {}) },
      animated: patch.condition !== undefined ? !!patch.condition : e.animated,
    } : e));
  }, [setEdges]);

  const removeSelected = useCallback(() => {
    if (selectedNodeId) {
      setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
      setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges(eds => eds.filter(e => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges]);

  const selNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
  const selEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId), [edges, selectedEdgeId]);

  return (
    <div className="flex h-full min-h-0">
      {/* Palette */}
      <div className="w-40 border-r shrink-0 p-2 flex flex-col gap-1.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">Add node</p>
        {PALETTE_TYPES.map(t => {
          const m = NODE_META[t]; const Icon = m.icon;
          return (
            <button key={t} type="button" onClick={() => addNode(t)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md border ${m.border} ${m.bg} ${m.color} text-[11px] font-medium hover:shadow-sm transition-all text-left`}
              data-testid={`palette-add-${t}`}>
              <Icon className="w-3 h-3 shrink-0" /> {m.label}
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }}
          onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          fitView
          proOptions={{ hideAttribution: true }}
          data-testid="reactflow-canvas"
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable className="!bg-muted" />
        </ReactFlow>
      </div>

      {/* Inspector */}
      {(selNode || selEdge) && (
        <div className="w-60 border-l shrink-0 p-3 flex flex-col gap-2.5 overflow-y-auto" data-testid="flow-inspector">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">{selNode ? "Step" : "Connection"}</p>
            <div className="flex items-center gap-1">
              <button type="button" onClick={removeSelected} className="p-1 rounded hover:bg-red-500/10 text-red-500" data-testid="button-delete-selected"><Trash2 className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          {selNode && (() => {
            const d = selNode.data as RFData;
            return (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Type</label>
                  <select value={d.ntype} onChange={e => patchNode(selNode.id, { ntype: e.target.value as ProcessNodeType })}
                    className="h-7 text-xs rounded-md border bg-background px-1.5" data-testid="select-node-type">
                    {PALETTE_TYPES.map(t => <option key={t} value={t}>{NODE_META[t].label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Label</label>
                  <Input value={d.label} onChange={e => patchNode(selNode.id, { label: e.target.value })} className="h-7 text-xs" data-testid="input-node-label" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Description</label>
                  <Textarea value={d.description || ""} onChange={e => patchNode(selNode.id, { description: e.target.value })} className="text-xs resize-none h-16" data-testid="input-node-desc" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Actor</label>
                  <Input value={d.actor || ""} onChange={e => patchNode(selNode.id, { actor: e.target.value })} placeholder="System / AI / Manager…" className="h-7 text-xs" data-testid="input-node-actor" />
                </div>
              </>
            );
          })()}
          {selEdge && (
            <>
              <p className="text-[10px] text-muted-foreground">Branch from a Decision? Label it and add the condition that routes down this path.</p>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Label</label>
                <Input value={(selEdge.label as string) || ""} onChange={e => patchEdge(selEdge.id, { label: e.target.value })} placeholder="e.g. Approved" className="h-7 text-xs" data-testid="input-edge-label" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Condition</label>
                <Input value={((selEdge.data as any)?.condition as string) || ""} onChange={e => patchEdge(selEdge.id, { condition: e.target.value })} placeholder="e.g. amount > 10000" className="h-7 text-xs" data-testid="input-edge-condition" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FlowGraphCanvas({ flowKey, initialNodes, initialEdges, onChange }: Props) {
  return (
    <ReactFlowProvider>
      <Canvas key={flowKey} initialNodes={initialNodes} initialEdges={initialEdges} onChange={onChange} />
    </ReactFlowProvider>
  );
}
