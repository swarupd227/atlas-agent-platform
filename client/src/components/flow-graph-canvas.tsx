import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, Handle, Position, useReactFlow,
  type Node as RFNode, type Edge as RFEdge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play, Database, Brain, GitBranch, UserCheck, Zap, Bell, GitFork, RotateCcw, Square,
  Trash2, X, Workflow, Sparkles, Network, SquareFunction, AlertTriangle, Undo2, Redo2, LayoutGrid,
} from "lucide-react";

/** A node/edge-anchored validation finding from the server compiler, mirrored
 *  client-side so the canvas can badge the exact offending step. Kept in sync
 *  with CompiledIssue in server/process-flow-compile.ts. */
export interface FlowIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { layoutGraph, type ProcessNode, type ProcessEdge, type ProcessNodeType } from "@shared/process-flow";
import type { Skill, KnowledgeBase, Agent } from "@shared/schema";

type NodeMeta = { label: string; icon: any; color: string; bg: string; border: string; chip: string };
// Full-strength outlines and a visible tint: at /40 outlines and /5 fills the steps faded into the dotted canvas.
const NODE_META: Record<ProcessNodeType, NodeMeta> = {
  trigger:           { label: "Trigger",      icon: Play,     color: "text-sky-700 dark:text-sky-300",         bg: "bg-sky-500/10",     border: "border-sky-500", chip: "bg-sky-600" },
  get_info:          { label: "Get Info",     icon: Database, color: "text-cyan-700 dark:text-cyan-300",       bg: "bg-cyan-500/10",    border: "border-cyan-500", chip: "bg-cyan-600" },
  ai_reasoning:      { label: "AI Reasoning", icon: Brain,    color: "text-violet-700 dark:text-violet-300",   bg: "bg-violet-500/10",  border: "border-violet-500", chip: "bg-violet-600" },
  make_decision:     { label: "Decision",     icon: GitBranch,color: "text-amber-700 dark:text-amber-300",     bg: "bg-amber-500/10",   border: "border-amber-500", chip: "bg-amber-600" },
  expert_approval:   { label: "Approval",     icon: UserCheck,color: "text-rose-700 dark:text-rose-300",       bg: "bg-rose-500/10",    border: "border-rose-500", chip: "bg-rose-600" },
  take_action:       { label: "Action",       icon: Zap,      color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500", chip: "bg-emerald-600" },
  send_notification: { label: "Notify",       icon: Bell,     color: "text-blue-700 dark:text-blue-300",       bg: "bg-blue-500/10",    border: "border-blue-500", chip: "bg-blue-600" },
  parallel:          { label: "Parallel",     icon: GitFork,  color: "text-indigo-700 dark:text-indigo-300",   bg: "bg-indigo-500/10",  border: "border-indigo-500", chip: "bg-indigo-600" },
  loop:              { label: "Loop / Retry", icon: RotateCcw,color: "text-orange-700 dark:text-orange-300",   bg: "bg-orange-500/10",  border: "border-orange-500", chip: "bg-orange-600" },
  n8n:               { label: "External Workflow", icon: Workflow, color: "text-pink-700 dark:text-pink-300", bg: "bg-pink-500/10",    border: "border-pink-500", chip: "bg-pink-600" },
  sub_flow:          { label: "Sub-Flow",     icon: Network,  color: "text-indigo-700 dark:text-indigo-300",   bg: "bg-indigo-500/10",  border: "border-indigo-500", chip: "bg-indigo-600" },
  expression:        { label: "Expression",   icon: SquareFunction, color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-500/10", border: "border-slate-500", chip: "bg-slate-600" },
  end:               { label: "End",          icon: Square,   color: "text-slate-700 dark:text-slate-300",     bg: "bg-slate-500/10",   border: "border-slate-500", chip: "bg-slate-500" },
};

// Connections: darker and thicker than React Flow's default hairline, labels on an opaque chip so "Approved" /
// "Rejected" stay readable where lines cross. Render-only; never written to the saved flow.
// "Hot" (selected, or touching the selected node) edges draw full-strength; everything else
// recedes -- matches team-graph-canvas.tsx's blueprint editor, whose all-labels-dimmed-except-the-
// selected-one approach reads far cleaner than showing every condition text at once (see EDGE_LABEL
// visibility below).
const EDGE_STYLE = { stroke: "hsl(var(--foreground) / 0.55)", strokeWidth: 1.4 };
const EDGE_HOT_STYLE = { stroke: "hsl(var(--foreground))", strokeWidth: 2 };
const EDGE_SELECTED_STYLE = { stroke: "hsl(var(--primary))", strokeWidth: 2.5 };
const EDGE_LABEL_PROPS = {
  labelStyle: { fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" },
  labelBgStyle: { fill: "hsl(var(--background))", stroke: "hsl(var(--foreground) / 0.3)", strokeWidth: 1 },
  labelBgPadding: [6, 3] as [number, number],
  labelBgBorderRadius: 4,
};

export const PALETTE_TYPES: ProcessNodeType[] = [
  "trigger", "get_info", "ai_reasoning", "make_decision",
  "expert_approval", "take_action", "send_notification", "parallel", "loop", "n8n", "sub_flow", "expression", "end",
];

// The step rail, grouped by what a step is for.
const PALETTE_GROUPS: Array<{ label: string; types: ProcessNodeType[] }> = [
  { label: "Flow", types: ["trigger", "end"] },
  { label: "Work", types: ["take_action", "ai_reasoning", "get_info", "expression"] },
  { label: "Control", types: ["make_decision", "parallel", "loop", "sub_flow", "n8n"] },
  { label: "People", types: ["expert_approval", "send_notification"] },
];

type RFData = { ntype: ProcessNodeType; label: string; description?: string; actor?: string; config?: Record<string, unknown>; _issue?: string };

function ProcessFlowNode({ data, selected }: NodeProps) {
  const d = data as RFData;
  const meta = NODE_META[d.ntype] || NODE_META.take_action;
  const Icon = meta.icon;
  return (
    <div
      className={`relative w-44 rounded-[10px] border bg-card px-3 py-2 text-card-foreground ${selected ? "border-foreground shadow-[0_0_0_3px_hsl(var(--ring)/0.45)]" : d._issue ? "border-amber-500 shadow-[0_0_0_2px_rgb(245_158_11/0.35)]" : "shadow-sm hover:border-foreground/50"}`}
      title={d._issue || undefined}
      data-testid={`flow-node-${d.ntype}`}
    >
      {d._issue && (
        <div className="absolute -top-2 -right-2 z-10" data-testid="node-issue-badge">
          <AlertTriangle className="w-4 h-4 text-amber-500 fill-amber-100 dark:fill-amber-950" />
        </div>
      )}
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !bg-foreground/60 !border-background" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] text-white ${meta.chip}`}>
          <Icon className="w-3 h-3" />
        </span>
        <span className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{meta.label}</span>
      </div>
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{d.label || "Untitled"}</p>
      {d.actor && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{d.actor}</p>}
      {!!d.config?.skillName && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 shrink-0" /> {String(d.config.skillName)}
        </p>
      )}
      {!!d.config?.kbName && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
          <Database className="w-2.5 h-2.5 shrink-0" /> {String(d.config.kbName)}
        </p>
      )}
      {d.ntype === "sub_flow" && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
          <Network className="w-2.5 h-2.5 shrink-0" /> {d.config?.refTeamAgentName ? String(d.config.refTeamAgentName) : "Not configured"}
        </p>
      )}
      {d.ntype === "expression" && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate font-mono flex items-center gap-1">
          <SquareFunction className="w-2.5 h-2.5 shrink-0" /> {d.config?.expression ? String(d.config.expression) : "Not configured"}
        </p>
      )}
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !bg-foreground !border-background" />
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
/** Exported for the round-trip test: this conversion is lossy by construction. */
export function toRFEdges(edges: ProcessEdge[]): RFEdge[] {
  return edges.map((e) => ({
    id: e.id || `${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.label,
    // Carry every edge property the canvas doesn't itself render, not just the
    // ones it draws with: this conversion runs on load, so anything left out
    // here is gone from the page's graph before the user touches it.
    data: { condition: e.condition, maxRounds: e.maxRounds },
    animated: !!e.condition,
  }));
}
/** Exported for the round-trip test: see toRFEdges. */
export function fromRF(nodes: RFNode[], edges: RFEdge[]): { nodes: ProcessNode[]; edges: ProcessEdge[] } {
  return {
    nodes: nodes.map(n => {
      const d = n.data as RFData;
      return { id: n.id, type: d.ntype, label: d.label, description: d.description, actor: d.actor, position: n.position, estimatedMins: undefined, config: d.config } as ProcessNode;
    }),
    edges: edges.map(e => {
      const d = (e.data ?? {}) as { condition?: string; maxRounds?: number };
      return {
        id: e.id,
        from: e.source,
        to: e.target,
        label: e.label as string | undefined,
        condition: d.condition,
        // Only when set, so an ordinary edge doesn't gain a maxRounds: undefined
        // key that then has to be stripped again on the way to the server.
        ...(d.maxRounds === undefined ? {} : { maxRounds: d.maxRounds }),
      };
    }),
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
  /** Validation findings from the last compile, badged onto the offending steps. */
  issues?: FlowIssue[];
  /** Controls the host page floats over the canvas area (between the step rail and the inspector). */
  overlay?: React.ReactNode;
}

function Canvas({ initialNodes, initialEdges, onChange, issues, overlay }: Omit<Props, "flowKey">) {
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>(toRFNodes(initialNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RFEdge>(toRFEdges(initialEdges));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // ---- Undo / redo ----------------------------------------------------------
  // Snapshot the graph before each discrete mutation (add / delete / connect /
  // drop / a settled field edit). Drag *frames* are excluded — only the final
  // dropped position is snapshotted — so a single drag is one undo step, not
  // hundreds. An undo/redo flows up through onChange to the parent, which
  // clears any stale validation badges (correct -- the graph changed).
  const pastRef = useRef<Array<{ nodes: RFNode[]; edges: RFEdge[] }>>([]);
  const futureRef = useRef<Array<{ nodes: RFNode[]; edges: RFEdge[] }>>([]);
  const lastEditKeyRef = useRef<{ key: string; t: number } | null>(null);
  const [histVersion, setHistVersion] = useState(0);

  const snapshot = useCallback((editKey?: string) => {
    // Coalesce rapid keystroke edits to the same field into one undo step.
    if (editKey) {
      const now = Date.now();
      const last = lastEditKeyRef.current;
      if (last && last.key === editKey && now - last.t < 700) { lastEditKeyRef.current = { key: editKey, t: now }; return; }
      lastEditKeyRef.current = { key: editKey, t: now };
    } else {
      lastEditKeyRef.current = null;
    }
    pastRef.current.push({ nodes: nodes.map(n => ({ ...n, data: { ...(n.data as RFData) } })), edges: edges.map(e => ({ ...e })) });
    if (pastRef.current.length > 100) pastRef.current.shift();
    futureRef.current = [];
    setHistVersion(v => v + 1);
  }, [nodes, edges]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ nodes, edges });
    setNodes(prev.nodes); setEdges(prev.edges);
    setSelectedNodeId(null); setSelectedEdgeId(null);
    setHistVersion(v => v + 1);
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ nodes, edges });
    setNodes(next.nodes); setEdges(next.edges);
    setSelectedNodeId(null); setSelectedEdgeId(null);
    setHistVersion(v => v + 1);
  }, [nodes, edges, setNodes, setEdges]);

  // Propagate any change up to the parent (graph is the source of truth there).
  useEffect(() => {
    const g = fromRF(nodes, edges);
    onChange(g.nodes, g.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onConnect = useCallback((c: Connection) => {
    snapshot();
    setEdges(eds => addEdge({ ...c, id: `e_${newId()}` }, eds));
  }, [setEdges, snapshot]);

  const placeNode = useCallback((ntype: ProcessNodeType, position?: { x: number; y: number }) => {
    const id = newId();
    snapshot();
    // Compute the grid slot from the functional-update's own `nds`, not the
    // `nodes` closed over at render time -- two palette clicks fired before
    // React commits the first click's state update (e.g. a fast double-click)
    // otherwise both read the same stale count and land on identical
    // coordinates, silently stacking the second node exactly under the first.
    setNodes(nds => {
      const count = nds.length;
      const pos = position || { x: (count % 5) * 240, y: Math.floor(count / 5) * 140 + 40 };
      return nds.concat({
        id, type: "process",
        position: pos,
        data: { ntype, label: NODE_META[ntype].label, description: "", actor: "" } as RFData,
        initialWidth: 176,
        initialHeight: 64,
      });
    });
    setSelectedNodeId(id);
  }, [setNodes, snapshot]);

  const addNode = useCallback((ntype: ProcessNodeType) => placeNode(ntype), [placeNode]);

  // Drop a palette item at the cursor -- real drag-and-drop placement, versus
  // the click-to-append-at-next-grid-slot fallback that addNode still provides.
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const ntype = e.dataTransfer.getData("application/reactflow") as ProcessNodeType;
    if (!ntype || !NODE_META[ntype]) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    placeNode(ntype, position);
  }, [screenToFlowPosition, placeNode]);

  const patchNode = useCallback((id: string, patch: Partial<RFData>, editKey?: string) => {
    snapshot(editKey ?? `node:${id}:${Object.keys(patch)[0]}`);
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...(n.data as RFData), ...patch } } : n));
  }, [setNodes, snapshot]);
  const patchEdge = useCallback((id: string, patch: { label?: string; condition?: string }) => {
    snapshot(`edge:${id}:${Object.keys(patch)[0]}`);
    setEdges(eds => eds.map(e => e.id === id ? {
      ...e,
      label: patch.label !== undefined ? patch.label : e.label,
      data: { ...(e.data as any), ...(patch.condition !== undefined ? { condition: patch.condition } : {}) },
      animated: patch.condition !== undefined ? !!patch.condition : e.animated,
    } : e));
  }, [setEdges, snapshot]);

  const removeSelected = useCallback(() => {
    snapshot();
    if (selectedNodeId) {
      setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
      setEdges(eds => eds.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    } else if (selectedEdgeId) {
      setEdges(eds => eds.filter(e => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  }, [selectedNodeId, selectedEdgeId, setNodes, setEdges, snapshot]);

  // Re-run the auto-layout on the current graph (manual "Tidy up") — a settled,
  // undoable snapshot, then fit the view to the freshly arranged nodes.
  const tidy = useCallback(() => {
    if (nodes.length === 0) return;
    snapshot();
    const pn = nodes.map(n => ({ id: n.id, type: (n.data as RFData).ntype, label: (n.data as RFData).label })) as ProcessNode[];
    const pe = edges.map(e => ({ id: e.id, from: e.source, to: e.target })) as ProcessEdge[];
    const posById = new Map(layoutGraph(pn, pe).map(n => [n.id, n.position!]));
    setNodes(nds => nds.map(n => (posById.get(n.id) ? { ...n, position: posById.get(n.id)! } : n)));
    setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60);
  }, [nodes, edges, snapshot, setNodes, fitView]);

  // Keyboard: undo/redo. Ignore when typing in an input/textarea/select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Snapshot a settled drag (final position only) so a reposition is undoable.
  const onNodeDragStop = useCallback(() => { snapshot(); }, [snapshot]);

  // Index the last compile's findings by node/edge so we can badge them.
  const issuesByNode = useMemo(() => {
    const m: Record<string, FlowIssue[]> = {};
    for (const it of issues || []) if (it.nodeId) (m[it.nodeId] ||= []).push(it);
    return m;
  }, [issues]);
  const issuesByEdge = useMemo(() => {
    const m: Record<string, FlowIssue[]> = {};
    for (const it of issues || []) if (it.edgeId) (m[it.edgeId] ||= []).push(it);
    return m;
  }, [issues]);

  // Render-only merge of issue data into nodes/edges -- never written to state,
  // so it can't collide with user edits or the parent round-trip.
  const displayNodes = useMemo(() => nodes.map(n => {
    const nodeIssues = issuesByNode[n.id];
    return nodeIssues?.length ? { ...n, data: { ...(n.data as RFData), _issue: nodeIssues[0].message } } : n;
  }), [nodes, issuesByNode]);
  // A retry/loop edge whose target sits at or behind its source's column (laid
  // out right-to-left) shares React Flow's default bezier curvature with every
  // forward edge, so its midpoint -- where its label lands -- routinely fell on
  // top of a nearby forward edge's own label (confirmed live: two labels
  // stacked at the same point, only fragments of each readable). A much wider
  // curvature bows the loop further out, away from the forward edges' band.
  const nodeX = useMemo(() => new Map(nodes.map(n => [n.id, n.position.x])), [nodes]);
  // Labels stay visible at rest (the flow needs to read at a glance -- that's the whole point of a
  // decision's Yes/No), but once something IS selected, only that edge (or edges touching the
  // selected node) keeps its label; every other label hides and its line recedes. That's the actual
  // fix for the "always cluttered" feeling: at rest a well-spaced flow with a handful of labels
  // reads fine, but the moment you're focused on one branch, every OTHER label competing for the
  // same narrow bands between columns is pure noise -- matches team-graph-canvas.tsx's blueprint
  // editor's declutter-on-selection behavior, minus its harsher hidden-until-selected default.
  const displayEdges = useMemo(() => edges.map(e => {
    const edgeIssues = issuesByEdge[e.id];
    const isBackEdge = (nodeX.get(e.target) ?? 0) <= (nodeX.get(e.source) ?? 0);
    const nothingSelected = !selectedNodeId && !selectedEdgeId;
    const hot = e.id === selectedEdgeId || e.source === selectedNodeId || e.target === selectedNodeId;
    const base = {
      ...e, ...EDGE_LABEL_PROPS,
      label: hot || nothingSelected ? e.label : undefined,
      style: {
        ...(e.style || {}),
        ...(e.id === selectedEdgeId ? EDGE_SELECTED_STYLE : hot ? EDGE_HOT_STYLE : EDGE_STYLE),
        opacity: hot || nothingSelected ? 1 : 0.45,
      },
      ...(isBackEdge ? { pathOptions: { curvature: 1.1 } } : {}),
    };
    // A compiler-flagged issue is worth seeing regardless of selection -- it's not decoration.
    return edgeIssues?.length
      ? { ...base, label: e.label || "no condition", style: { ...base.style, stroke: "#f59e0b", strokeWidth: 2.5, opacity: 1 } }
      : base;
  }), [edges, issuesByEdge, selectedEdgeId, selectedNodeId, nodeX]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;
  void histVersion; // re-render trigger for canUndo/canRedo

  const selNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
  const selEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId), [edges, selectedEdgeId]);

  return (
    <div className="flex h-full min-h-0">
      {/* Step rail: drag a step onto the canvas, or click to append it. */}
      <div className="w-[76px] shrink-0 border-r bg-background flex flex-col overflow-y-auto" aria-label="Add a step">
        <div className="flex items-center justify-center gap-0.5 border-b px-1 py-1.5">
          <button
            type="button" onClick={undo} disabled={!canUndo}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
            title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="button-flow-undo"
          ><Undo2 className="w-3.5 h-3.5" /></button>
          <button
            type="button" onClick={redo} disabled={!canRedo}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
            title="Redo (Ctrl+Shift+Z)" aria-label="Redo" data-testid="button-flow-redo"
          ><Redo2 className="w-3.5 h-3.5" /></button>
          <button
            type="button" onClick={tidy} disabled={nodes.length === 0}
            className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:pointer-events-none"
            title="Tidy up — auto-arrange the layout" aria-label="Tidy up" data-testid="button-flow-tidy"
          ><LayoutGrid className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex flex-col gap-0.5 px-1.5 pb-3" title="Drag onto the canvas, or click to append">
          {PALETTE_GROUPS.map(g => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <span className="pt-2 pb-0.5 text-center font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{g.label}</span>
              {g.types.map(t => {
                const m = NODE_META[t]; const Icon = m.icon;
                return (
                  <button key={t} type="button" onClick={() => addNode(t)}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData("application/reactflow", t); e.dataTransfer.effectAllowed = "move"; }}
                    className="flex flex-col items-center gap-1 rounded-[7px] border border-transparent px-0.5 py-1 text-center text-[10.5px] leading-tight text-foreground transition-colors hover:border-border hover:bg-card cursor-grab active:cursor-grabbing"
                    data-testid={`palette-add-${t}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-md text-white ${m.chip}`}><Icon className="w-3.5 h-3.5" /></span>
                    {m.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0 relative bg-background" onDrop={onDrop} onDragOver={onDragOver}>
        {overlay}
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => { setSelectedNodeId(n.id); setSelectedEdgeId(null); }}
          onEdgeClick={(_, e) => { setSelectedEdgeId(e.id); setSelectedNodeId(null); }}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
          fitView
          proOptions={{ hideAttribution: true }}
          data-testid="reactflow-canvas"
        >
          <Background color="hsl(var(--foreground) / 0.18)" gap={18} size={1.2} />
          <Controls showInteractive={false} className="!shadow-sm [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground" />
        </ReactFlow>
      </div>

      {/* Inspector */}
      {(selNode || selEdge) && (
        <div className="w-72 border-l bg-card shrink-0 p-4 flex flex-col gap-3 overflow-y-auto" data-testid="flow-inspector">
          <div className="flex items-center justify-between">
            <p className="font-[family-name:var(--astra-display)] text-base font-semibold">{selNode ? "Step settings" : "Connection"}</p>
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
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Type</label>
                  <select value={d.ntype} onChange={e => patchNode(selNode.id, { ntype: e.target.value as ProcessNodeType })}
                    className="h-7 text-xs rounded-md border bg-background px-1.5" data-testid="select-node-type">
                    {PALETTE_TYPES.map(t => <option key={t} value={t}>{NODE_META[t].label}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Label</label>
                  <Input value={d.label} onChange={e => patchNode(selNode.id, { label: e.target.value })} className="h-7 text-xs" data-testid="input-node-label" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Description</label>
                  <Textarea value={d.description || ""} onChange={e => patchNode(selNode.id, { description: e.target.value })} className="text-xs resize-none h-16" data-testid="input-node-desc" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Actor</label>
                  <Input value={d.actor || ""} onChange={e => patchNode(selNode.id, { actor: e.target.value })} placeholder="System / AI / Manager…" className="h-7 text-xs" data-testid="input-node-actor" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Skill</label>
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
                  <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Knowledge Base</label>
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
                {d.ntype === "loop" && (
                  <div className="flex flex-col gap-1 rounded-md border border-orange-500/30 bg-orange-500/5 p-2">
                    <label className="text-[10px] text-orange-600 dark:text-orange-400 uppercase tracking-wide font-medium">Max iterations</label>
                    <Input
                      type="number"
                      min={1}
                      value={String((d.config?.maxIterations as number) ?? "")}
                      onChange={e => {
                        const v = e.target.value ? Math.max(1, parseInt(e.target.value)) : undefined;
                        patchNode(selNode.id, { config: { ...(d.config || {}), maxIterations: v } }, `node:${selNode.id}:maxIterations`);
                      }}
                      placeholder="3"
                      className="h-7 text-xs"
                      data-testid="input-node-max-iterations"
                    />
                    <span className="text-[10px] text-muted-foreground">Caps how many times this loop retries before it gives up (compiled to a bounded retry).</span>
                  </div>
                )}
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
                <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Label</label>
                <Input value={(selEdge.label as string) || ""} onChange={e => patchEdge(selEdge.id, { label: e.target.value })} placeholder="e.g. Approved" className="h-7 text-xs" data-testid="input-edge-label" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Condition</label>
                <Input value={((selEdge.data as any)?.condition as string) || ""} onChange={e => patchEdge(selEdge.id, { condition: e.target.value })} placeholder="e.g. amount > 10000" className="h-7 text-xs" data-testid="input-edge-condition" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FlowGraphCanvas({ flowKey, initialNodes, initialEdges, onChange, issues, overlay }: Props) {
  return (
    <ReactFlowProvider>
      <Canvas key={flowKey} initialNodes={initialNodes} initialEdges={initialEdges} onChange={onChange} issues={issues} overlay={overlay} />
    </ReactFlowProvider>
  );
}
