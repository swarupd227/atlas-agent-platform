import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Handle, Position,
  type Node as RFNode, type Edge as RFEdge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Database, Brain, GitBranch, UserCheck, Zap, Bell, GitFork, RotateCcw, Square,
  Trash2, X, Workflow, Sparkles, Network, SquareFunction,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { ProcessNode, ProcessEdge, ProcessNodeType } from "@shared/process-flow";
import type { Skill, KnowledgeBase, Agent } from "@shared/schema";

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
  n8n:               { label: "External Workflow", icon: Workflow, color: "text-pink-600",    bg: "bg-pink-500/5",    border: "border-pink-500/40" },
  sub_flow:          { label: "Sub-Flow",     icon: Network,  color: "text-indigo-600",  bg: "bg-indigo-500/5",  border: "border-indigo-500/40" },
  expression:        { label: "Expression",   icon: SquareFunction, color: "text-slate-600", bg: "bg-slate-500/5", border: "border-slate-500/40" },
  end:               { label: "End",          icon: Square,   color: "text-slate-600",   bg: "bg-slate-500/5",   border: "border-slate-500/40" },
};

export const PALETTE_TYPES: ProcessNodeType[] = [
  "trigger", "get_info", "ai_reasoning", "make_decision",
  "expert_approval", "take_action", "send_notification", "parallel", "loop", "n8n", "sub_flow", "expression", "end",
];

type RFData = { ntype: ProcessNodeType; label: string; description?: string; actor?: string; config?: Record<string, unknown> };

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
      {!!d.config?.skillName && (
        <p className="text-[9px] text-violet-600 dark:text-violet-400 mt-0.5 truncate flex items-center gap-0.5">
          <Sparkles className="w-2.5 h-2.5 shrink-0" /> {String(d.config.skillName)}
        </p>
      )}
      {!!d.config?.kbName && (
        <p className="text-[9px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate flex items-center gap-0.5">
          <Database className="w-2.5 h-2.5 shrink-0" /> {String(d.config.kbName)}
        </p>
      )}
      {d.ntype === "sub_flow" && (
        <p className="text-[9px] text-indigo-600 dark:text-indigo-400 mt-0.5 truncate flex items-center gap-0.5">
          <Network className="w-2.5 h-2.5 shrink-0" /> {d.config?.refTeamAgentName ? String(d.config.refTeamAgentName) : "Not configured"}
        </p>
      )}
      {d.ntype === "expression" && (
        <p className="text-[9px] text-slate-600 dark:text-slate-400 mt-0.5 truncate font-mono flex items-center gap-0.5">
          <SquareFunction className="w-2.5 h-2.5 shrink-0" /> {d.config?.expression ? String(d.config.expression) : "Not configured"}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-primary" />
    </div>
  );
}

const nodeTypes = { process: ProcessFlowNode };

/** Compact search/attach control for binding a real catalog skill to a step --
 *  mirrors the "skill" node pattern already proven in team-graph-editor.tsx,
 *  scoped down to fit this panel's 240px inspector width. */
function SkillPicker({ skillId, skillName, onAttach, onRemove }: {
  skillId?: string;
  skillName?: string;
  onAttach: (skill: { id: string; name: string; domain: string }) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data: skills } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return (skills || [])
      .filter(s => s.status === "active" && (s.name.toLowerCase().includes(q) || (s.domain || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [skills, query]);

  if (skillId) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-violet-500/30 bg-violet-500/5" data-testid="attached-skill">
        <Sparkles className="w-3 h-3 text-violet-500 shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{skillName}</span>
        <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-muted shrink-0" data-testid="button-remove-node-skill">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search skills library…"
        className="h-7 text-xs"
        data-testid="input-node-skill-search"
      />
      {matches.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-md border p-0.5">
          {matches.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onAttach({ id: s.id, name: s.name, domain: s.domain }); setQuery(""); }}
              className="text-left px-1.5 py-1 rounded text-[11px] hover-elevate"
              data-testid={`option-node-skill-${s.id}`}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-muted-foreground"> · {s.domain}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Same pattern as SkillPicker above, for binding a real knowledge base to a step. */
function KbPicker({ kbId, kbName, onAttach, onRemove }: {
  kbId?: string;
  kbName?: string;
  onAttach: (kb: { id: string; name: string }) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data: kbs } = useQuery<KnowledgeBase[]>({ queryKey: ["/api/knowledge-bases"] });
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return (kbs || [])
      .filter(k => k.status === "active" && (k.name.toLowerCase().includes(q) || (k.description || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [kbs, query]);

  if (kbId) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/5" data-testid="attached-kb">
        <Database className="w-3 h-3 text-emerald-500 shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{kbName}</span>
        <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-muted shrink-0" data-testid="button-remove-node-kb">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search knowledge bases…"
        className="h-7 text-xs"
        data-testid="input-node-kb-search"
      />
      {matches.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-md border p-0.5">
          {matches.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => { onAttach({ id: k.id, name: k.name }); setQuery(""); }}
              className="text-left px-1.5 py-1 rounded text-[11px] hover-elevate"
              data-testid={`option-node-kb-${k.id}`}
            >
              <span className="font-medium">{k.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Same search-and-attach pattern as SkillPicker/KbPicker, for binding a
 *  sub_flow step to a deployed team agent (the executable target
 *  executeTeamReferenceNode calls). Excludes team agents with no blueprint --
 *  nothing to actually run. */
function SubFlowPicker({ teamAgentId, teamAgentName, onAttach, onRemove }: {
  teamAgentId?: string;
  teamAgentName?: string;
  onAttach: (agent: { id: string; name: string }) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return (agents || [])
      .filter(a => !!(a as any).blueprintId && a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [agents, query]);

  if (teamAgentId) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-indigo-500/30 bg-indigo-500/5" data-testid="attached-sub-flow">
        <Network className="w-3 h-3 text-indigo-500 shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1">{teamAgentName}</span>
        <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-muted shrink-0" data-testid="button-remove-node-sub-flow">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search flows to call…"
        className="h-7 text-xs"
        data-testid="input-node-sub-flow-search"
      />
      {matches.length > 0 && (
        <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto rounded-md border p-0.5">
          {matches.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => { onAttach({ id: a.id, name: a.name }); setQuery(""); }}
              className="text-left px-1.5 py-1 rounded text-[11px] hover-elevate"
              data-testid={`option-node-sub-flow-${a.id}`}
            >
              <span className="font-medium">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function toRFNodes(nodes: ProcessNode[]): RFNode[] {
  return nodes.map((n, i) => ({
    id: n.id,
    type: "process",
    position: n.position && (n.position.x || n.position.y) ? n.position : { x: (i % 5) * 240, y: Math.floor(i / 5) * 140 },
    data: { ntype: n.type, label: n.label, description: n.description, actor: n.actor, config: n.config } as RFData,
    // React Flow can't compute an edge path to/from a node it hasn't measured
    // yet (via ResizeObserver, after first paint) -- when nodes AND edges are
    // both set in the same initial state (AI-generated flow, template load),
    // every edge silently fails to render until that measurement lands. These
    // hints give it an immediate box to route edges against; real DOM
    // measurement still takes over right after mount for accurate sizing.
    initialWidth: 176,
    initialHeight: 64,
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
      return { id: n.id, type: d.ntype, label: d.label, description: d.description, actor: d.actor, position: n.position, estimatedMins: undefined, config: d.config } as ProcessNode;
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
    // Compute the grid slot from the functional-update's own `nds`, not the
    // `nodes` closed over at render time -- two palette clicks fired before
    // React commits the first click's state update (e.g. a fast double-click)
    // otherwise both read the same stale count and land on identical
    // coordinates, silently stacking the second node exactly under the first.
    setNodes(nds => {
      const count = nds.length;
      return nds.concat({
        id, type: "process",
        position: { x: (count % 5) * 240, y: Math.floor(count / 5) * 140 + 40 },
        data: { ntype, label: NODE_META[ntype].label, description: "", actor: "" } as RFData,
        initialWidth: 176,
        initialHeight: 64,
      });
    });
    setSelectedNodeId(id);
  }, [setNodes]);

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
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Skill</label>
                  <SkillPicker
                    skillId={d.config?.skillId as string | undefined}
                    skillName={d.config?.skillName as string | undefined}
                    onAttach={(skill) => patchNode(selNode.id, { config: { ...(d.config || {}), skillId: skill.id, skillName: skill.name, skillDomain: skill.domain } })}
                    onRemove={() => {
                      const { skillId: _skillId, skillName: _skillName, skillDomain: _skillDomain, ...rest } = (d.config || {}) as Record<string, unknown>;
                      patchNode(selNode.id, { config: rest });
                    }}
                  />
                  <span className="text-[10px] text-muted-foreground">Grounds agent-generation in a real skill instead of guessing from this step's text.</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Knowledge Base</label>
                  <KbPicker
                    kbId={d.config?.kbId as string | undefined}
                    kbName={d.config?.kbName as string | undefined}
                    onAttach={(kb) => patchNode(selNode.id, { config: { ...(d.config || {}), kbId: kb.id, kbName: kb.name } })}
                    onRemove={() => {
                      const { kbId: _kbId, kbName: _kbName, ...rest } = (d.config || {}) as Record<string, unknown>;
                      patchNode(selNode.id, { config: rest });
                    }}
                  />
                </div>
                {d.ntype === "n8n" && (
                  <div className="flex flex-col gap-1 rounded-md border border-pink-500/30 bg-pink-500/5 p-2">
                    <label className="text-[10px] text-pink-600 dark:text-pink-400 uppercase tracking-wide font-medium">n8n workflow path</label>
                    <Input
                      value={String((d.config?.n8nPath as string) || "")}
                      onChange={e => patchNode(selNode.id, { config: { ...(d.config || {}), n8nPath: e.target.value } })}
                      placeholder="webhook/your-workflow-id"
                      className="h-7 text-xs"
                      data-testid="input-node-n8n-path"
                    />
                    <span className="text-[10px] text-muted-foreground">Combined with your connected n8n base URL. Execution runs once the process-flow runtime is enabled (design-only today).</span>
                  </div>
                )}
                {d.ntype === "sub_flow" && (
                  <div className="flex flex-col gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-2">
                    <label className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wide font-medium">Flow to call</label>
                    <SubFlowPicker
                      teamAgentId={d.config?.refTeamAgentId as string | undefined}
                      teamAgentName={d.config?.refTeamAgentName as string | undefined}
                      onAttach={(agent) => patchNode(selNode.id, { config: { ...(d.config || {}), refTeamAgentId: agent.id, refTeamAgentName: agent.name } })}
                      onRemove={() => {
                        const { refTeamAgentId: _id, refTeamAgentName: _name, ...rest } = (d.config || {}) as Record<string, unknown>;
                        patchNode(selNode.id, { config: rest });
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">Runs the selected flow end to end and waits for it before continuing (Sync to Automation compiles this to a real Sub-Flow step).</span>
                  </div>
                )}
                {d.ntype === "expression" && (
                  <div className="flex flex-col gap-1 rounded-md border border-slate-500/30 bg-slate-500/5 p-2">
                    <label className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide font-medium">Expression (JSONata)</label>
                    <Textarea
                      value={String((d.config?.expression as string) || "")}
                      onChange={e => patchNode(selNode.id, { config: { ...(d.config || {}), expression: e.target.value } })}
                      placeholder={'{ "total": amount + tax, "customer": customerName }'}
                      rows={4}
                      className="text-xs font-mono resize-none"
                      data-testid="input-node-expression"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Reshapes the flow's data with no LLM call -- Sync to Automation compiles this to a real Expression step. Uses JSONata syntax.
                    </span>
                  </div>
                )}
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
