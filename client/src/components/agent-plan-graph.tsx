import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node as RFNode,
  type Edge as RFEdge,
  type NodeProps,
  type NodeHandle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, Network, UserCheck, GitBranch, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface PlanAgent {
  name: string;
  role?: string;
}

export interface PlanEdge {
  from: string;
  to: string;
  label?: string;
  type?: string;
}

export interface PlanDependencyEntry {
  agent: string;
  inputs: string[];
  outputs: string[];
  dependsOn: string[];
}

export interface AgentPlan {
  pattern: string;
  edges: PlanEdge[];
  agentDependencyMatrix?: PlanDependencyEntry[];
  parallelGroups?: string[][];
  executionGraph?: Array<{ stage: number; agents: string[]; waitForAll: boolean }>;
  /** Inject a human-in-the-loop gate after a specific stage (0-indexed). */
  humanCheckpoints?: Array<{
    afterStage: number;
    name: string;
    type?: "approval" | "review" | "audit";
  }>;
  /** Backward edges for retry / feedback loops. */
  feedbackEdges?: Array<{
    from: string;
    to: string;
    label?: string;
    maxRetries?: number;
  }>;
}

// ── Tier synthesis ────────────────────────────────────────────────────────────

export function buildTiers(
  agents: PlanAgent[],
  plan: AgentPlan
): Array<{ agents: string[]; waitForAll: boolean }> {
  if (plan.executionGraph?.length) {
    return plan.executionGraph.map(s => ({ agents: s.agents, waitForAll: s.waitForAll }));
  }
  if (plan.parallelGroups?.length) {
    return plan.parallelGroups.map(g => ({ agents: g, waitForAll: true }));
  }
  if (plan.agentDependencyMatrix?.length) {
    const matrix = plan.agentDependencyMatrix;
    const stageMap = new Map<string, number>();
    const allNames = new Set(matrix.map(e => e.agent));
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of matrix) {
        const depStages = entry.dependsOn
          .filter(d => allNames.has(d))
          .map(d => stageMap.get(d) ?? -1);
        const minStage = depStages.length === 0 ? 0 : Math.max(...depStages) + 1;
        if ((stageMap.get(entry.agent) ?? -1) < minStage) {
          stageMap.set(entry.agent, minStage);
          changed = true;
        }
      }
    }
    const maxStage = Math.max(0, ...Array.from(stageMap.values()));
    return Array.from({ length: maxStage + 1 }, (_, s) => ({
      agents: Array.from(stageMap.entries()).filter(([, st]) => st === s).map(([n]) => n),
      waitForAll: true,
    })).filter(t => t.agents.length > 0);
  }
  const names = agents.map(a => a.name);
  if (plan.pattern === "sequential") {
    return names.map(n => ({ agents: [n], waitForAll: true }));
  }
  return [{ agents: names, waitForAll: true }];
}

// ── Custom node components ────────────────────────────────────────────────────

function OrchestratorNode({ data }: NodeProps) {
  const d = data as { label: string };
  return (
    <div
      style={{ minWidth: 175 }}
      className="px-4 py-3 rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/10 to-violet-500/5 shadow-md"
    >
      <Handle type="source" position={Position.Bottom} id="orch-src" className="!bg-primary/60 !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Network className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-primary leading-tight truncate">{d.label}</div>
          <div className="text-[9px] text-primary/60">Coordinator · Orchestrator</div>
        </div>
      </div>
    </div>
  );
}

function WorkerNode({ id: nodeId, data }: NodeProps) {
  const d = data as {
    label: string;
    stage: number;
    isParallel: boolean;
    inputs?: string[];
    outputs?: string[];
  };
  const hasIO = (d.inputs?.length ?? 0) > 0 || (d.outputs?.length ?? 0) > 0;
  return (
    <div
      style={{ minWidth: 155 }}
      className="px-3 py-2.5 rounded-lg border border-border bg-card shadow-sm hover:border-violet-500/30 transition-colors"
    >
      <Handle type="target" position={Position.Top} id={`${nodeId}-tgt`} className="!bg-muted-foreground/40 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} id={`${nodeId}-src`} className="!bg-muted-foreground/40 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Left} id={`${nodeId}-lsrc`} style={{ opacity: 0, width: 6, height: 6 }} />
      <Handle type="target" position={Position.Left} id={`${nodeId}-ltgt`} style={{ opacity: 0, width: 6, height: 6 }} />
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-violet-500/10 flex items-center justify-center shrink-0">
          <Bot className="w-3 h-3 text-violet-500" />
        </div>
        <span className="text-[11px] font-medium leading-tight flex-1 min-w-0 truncate">{d.label}</span>
      </div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <Badge variant="secondary" className="text-[8px] px-1.5 py-0 h-4">
          Stage {d.stage + 1}
        </Badge>
        {d.isParallel && (
          <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-violet-500/20 text-violet-500">
            ∥ parallel
          </Badge>
        )}
        {hasIO && (
          <>
            {(d.inputs?.length ?? 0) > 0 && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-blue-500/20 text-blue-500">
                {d.inputs!.length} in
              </Badge>
            )}
            {(d.outputs?.length ?? 0) > 0 && (
              <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 border-emerald-500/20 text-emerald-500">
                {d.outputs!.length} out
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Diamond-shaped conditional branch node. */
function ConditionNode({ data }: NodeProps) {
  const d = data as { conditions: string[] };
  const label = d.conditions?.[0] || "condition";
  return (
    <div style={{ width: 40, height: 40, position: "relative" }}>
      <Handle type="target" position={Position.Top} id="cond-tgt" className="!bg-amber-500/60 !w-2 !h-2 !border-0" style={{ top: -4 }} />
      {/* Diamond via rotated square */}
      <div
        style={{ transform: "rotate(45deg)", transformOrigin: "center" }}
        className="absolute inset-0 rounded-sm border-2 border-amber-500/60 bg-gradient-to-br from-amber-500/15 to-amber-400/5 shadow-sm"
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <GitBranch className="w-3.5 h-3.5 text-amber-500" />
      </div>
      <Handle type="source" position={Position.Bottom} id="cond-src" className="!bg-amber-500/60 !w-2 !h-2 !border-0" style={{ bottom: -4 }} />
      {/* Floating label below */}
      <div
        className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20"
        style={{ zIndex: 10 }}
      >
        {label}
      </div>
    </div>
  );
}

/** Human-in-the-loop approval gate node. */
function CheckpointNode({ data }: NodeProps) {
  const d = data as { name: string; checkpointType: string };
  const typeColors: Record<string, string> = {
    approval: "border-blue-500/20 text-blue-500",
    review: "border-indigo-500/20 text-indigo-500",
    audit: "border-purple-500/20 text-purple-500",
  };
  const badgeCls = typeColors[d.checkpointType] || typeColors.approval;
  return (
    <div
      style={{ minWidth: 200 }}
      className="px-3 py-2.5 rounded-lg border-2 border-blue-500/35 bg-gradient-to-br from-blue-500/8 to-indigo-500/5 shadow-sm"
    >
      <Handle type="target" position={Position.Top} id="cp-tgt" className="!bg-blue-500/50 !w-2 !h-2 !border-0" />
      <Handle type="source" position={Position.Bottom} id="cp-src" className="!bg-blue-500/50 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-blue-500/12 flex items-center justify-center shrink-0">
          <UserCheck className="w-3 h-3 text-blue-500" />
        </div>
        <span className="text-[11px] font-medium leading-tight flex-1 min-w-0 truncate">{d.name || "Human Review"}</span>
        <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 shrink-0 ${badgeCls}`}>
          {d.checkpointType || "approval"}
        </Badge>
      </div>
    </div>
  );
}

/** Background grouping node for parallel tiers — rendered at zIndex -1. */
function ParallelGroupNode({ data }: NodeProps) {
  const d = data as { label: string; w: number; h: number };
  return (
    <div
      style={{ width: d.w, height: d.h, pointerEvents: "none" }}
      className="rounded-xl border border-dashed border-primary/20 bg-primary/[0.025]"
    >
      <div className="px-2 py-1">
        <span className="text-[9px] font-medium text-primary/40 select-none">{d.label}</span>
      </div>
    </div>
  );
}

const NODE_TYPES = {
  orchestrator: OrchestratorNode,
  worker: WorkerNode,
  condition: ConditionNode,
  checkpoint: CheckpointNode,
  parallelGroup: ParallelGroupNode,
};

// ── Layout constants ──────────────────────────────────────────────────────────

const NODE_W = 175;
const ORCH_H = 60;
const WORKER_H = 72;
const COND_SZ = 40;
const CHKPT_W = 210;
const CHKPT_H = 60;
const H_GAP = 30;
const V_GAP = 130;
const CANVAS_W = 840;
const GROUP_PAD = 14;

// Edge style presets
const EDGE_SEQUENTIAL = {
  style: { stroke: "hsl(var(--primary) / 0.45)", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary) / 0.6)", width: 12, height: 12 },
} as const;
const EDGE_CONDITIONAL = {
  style: { stroke: "hsl(38 92% 50% / 0.65)", strokeWidth: 1.5, strokeDasharray: "6 3" },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(38 92% 50% / 0.65)", width: 12, height: 12 },
} as const;
const EDGE_FALLBACK = {
  style: { strokeWidth: 1, strokeDasharray: "4 3", stroke: "hsl(var(--muted-foreground) / 0.5)" },
} as const;
const EDGE_CHECKPOINT = {
  animated: true,
  style: { stroke: "hsl(217 91% 60% / 0.55)", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(217 91% 60% / 0.55)", width: 12, height: 12 },
} as const;
const EDGE_FEEDBACK = {
  animated: true,
  style: { stroke: "hsl(340 82% 55% / 0.65)", strokeWidth: 1.5, strokeDasharray: "6 3" },
  markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(340 82% 55% / 0.65)", width: 12, height: 12 },
} as const;
const LABEL_PROPS = {
  labelStyle: { fontSize: 8, fill: "hsl(var(--muted-foreground))" },
  labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
  labelBgPadding: [3, 2] as [number, number],
};

// ── Layout engine ─────────────────────────────────────────────────────────────

function buildLayout(
  orchestrator: PlanAgent,
  agents: PlanAgent[],
  plan: AgentPlan
): { nodes: RFNode[]; edges: RFEdge[]; totalH: number } {
  const tiers = buildTiers(agents, plan);
  const nodes: RFNode[] = [];
  const rfEdges: RFEdge[] = [];

  // agent name/role → RF node ID
  const agentToNodeId = new Map<string, string>();

  // Dependency matrix lookup
  const depMatrix = new Map<string, PlanDependencyEntry>();
  for (const e of plan.agentDependencyMatrix || []) {
    depMatrix.set(e.agent, e);
  }

  // HITL checkpoint lookup: afterStage → spec
  const checkpointByStage = new Map<number, NonNullable<AgentPlan["humanCheckpoints"]>[number]>();
  for (const cp of plan.humanCheckpoints || []) {
    checkpointByStage.set(cp.afterStage, cp);
  }

  // Conditional branch detection: agents with 2+ conditional outgoing plan.edges get ConditionNode
  const condEdgesByFrom = new Map<string, PlanEdge[]>();
  for (const pe of plan.edges || []) {
    if (pe.type === "conditional") {
      if (!condEdgesByFrom.has(pe.from)) condEdgesByFrom.set(pe.from, []);
      condEdgesByFrom.get(pe.from)!.push(pe);
    }
  }
  const branchSources = new Set<string>(
    Array.from(condEdgesByFrom.entries()).filter(([, es]) => es.length >= 2).map(([src]) => src)
  );

  // ── Orchestrator ──────────────────────────────────────────────────────────
  nodes.push({
    id: "orch",
    type: "orchestrator",
    position: { x: CANVAS_W / 2 - NODE_W / 2, y: 20 },
    data: { label: orchestrator.name },
    width: NODE_W,
    height: ORCH_H,
    measured: { width: NODE_W, height: ORCH_H },
    handles: [
      { id: "orch-src", type: "source" as const, position: Position.Bottom, x: NODE_W / 2, y: ORCH_H, width: 10, height: 10 },
    ],
  } as RFNode);

  // ── PASS 1: Build tier nodes + group backgrounds + checkpoints ────────────
  let currentY = 150;
  const tierNodeIds: string[][] = [];
  const tierY: number[] = [];
  // What to connect FROM when building edges into the next tier:
  // (= tier node IDs, OR [checkpointId] if a checkpoint follows the tier)
  const tierExitIds: string[][] = [];

  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti];
    const count = tier.agents.length;
    const tierTotalW = count * NODE_W + (count - 1) * H_GAP;
    const startX = CANVAS_W / 2 - tierTotalW / 2;
    const isParallel = count > 1;
    const nodeIds: string[] = [];

    tierY.push(currentY);

    // Parallel group background (behind worker nodes, zIndex -1)
    if (isParallel) {
      const gw = tierTotalW + GROUP_PAD * 2;
      const gh = WORKER_H + GROUP_PAD * 2;
      nodes.push({
        id: `grp-${ti}`,
        type: "parallelGroup",
        position: { x: startX - GROUP_PAD, y: currentY - GROUP_PAD },
        data: { label: `Stage ${ti + 1} · Parallel`, w: gw, h: gh },
        width: gw,
        height: gh,
        measured: { width: gw, height: gh },
        handles: [],
        selectable: false,
        draggable: false,
        zIndex: -1,
      } as any as RFNode);
    }

    // Worker nodes
    for (let ai = 0; ai < count; ai++) {
      const agentName = tier.agents[ai];
      const agentObj = agents.find(a => a.name === agentName || a.role === agentName);
      const displayName = agentObj?.name || agentName;
      const nid = `n-${ti}-${ai}`;
      nodeIds.push(nid);
      agentToNodeId.set(agentName, nid);
      if (agentObj?.name) agentToNodeId.set(agentObj.name, nid);
      if (agentObj?.role) agentToNodeId.set(agentObj.role, nid);

      const depEntry =
        depMatrix.get(agentName) ||
        depMatrix.get(agentObj?.name || "") ||
        depMatrix.get(agentObj?.role || "");

      nodes.push({
        id: nid,
        type: "worker",
        position: { x: startX + ai * (NODE_W + H_GAP), y: currentY },
        data: {
          label: displayName,
          stage: ti,
          isParallel,
          inputs: depEntry?.inputs,
          outputs: depEntry?.outputs,
        },
        width: NODE_W,
        height: WORKER_H,
        measured: { width: NODE_W, height: WORKER_H },
        handles: [
          { id: `${nid}-tgt`, type: "target" as const, position: Position.Top, x: NODE_W / 2, y: 0, width: 8, height: 8 },
          { id: `${nid}-src`, type: "source" as const, position: Position.Bottom, x: NODE_W / 2, y: WORKER_H, width: 8, height: 8 },
          { id: `${nid}-lsrc`, type: "source" as const, position: Position.Left, x: 0, y: WORKER_H / 2, width: 6, height: 6 },
          { id: `${nid}-ltgt`, type: "target" as const, position: Position.Left, x: 0, y: WORKER_H / 2, width: 6, height: 6 },
        ],
      } as RFNode);
    }

    tierNodeIds.push(nodeIds);

    // ConditionNodes for branch-source agents in this tier
    for (let ai = 0; ai < count; ai++) {
      const agentName = tier.agents[ai];
      const agentObj = agents.find(a => a.name === agentName || a.role === agentName);
      const isBranchSrc =
        branchSources.has(agentName) ||
        (agentObj?.name ? branchSources.has(agentObj.name) : false) ||
        (agentObj?.role ? branchSources.has(agentObj.role) : false);
      if (!isBranchSrc) continue;

      const nid = nodeIds[ai];
      const condId = `cond-${nid}`;
      // Center vertically in the inter-tier gap
      const condY = currentY + WORKER_H + Math.floor((V_GAP - WORKER_H - COND_SZ) / 2);
      const srcNode = nodes.find(n => n.id === nid);
      const condX = (srcNode?.position.x ?? CANVAS_W / 2 - NODE_W / 2) + NODE_W / 2 - COND_SZ / 2;
      const condEdges =
        condEdgesByFrom.get(agentName) ||
        condEdgesByFrom.get(agentObj?.name || "") ||
        condEdgesByFrom.get(agentObj?.role || "") ||
        [];

      nodes.push({
        id: condId,
        type: "condition",
        position: { x: condX, y: condY },
        data: { conditions: condEdges.map(e => e.label || "if condition") },
        width: COND_SZ,
        height: COND_SZ,
        measured: { width: COND_SZ, height: COND_SZ },
        handles: [
          { id: `${condId}-tgt`, type: "target" as const, position: Position.Top, x: COND_SZ / 2, y: 0, width: 8, height: 8 },
          { id: `${condId}-src`, type: "source" as const, position: Position.Bottom, x: COND_SZ / 2, y: COND_SZ, width: 8, height: 8 },
        ],
      } as RFNode);
    }

    // Checkpoint node after this tier
    const checkpoint = checkpointByStage.get(ti);
    let cpId: string | null = null;
    if (checkpoint) {
      cpId = `cp-${ti}`;
      const cpY = currentY + V_GAP / 2 + 10;
      nodes.push({
        id: cpId,
        type: "checkpoint",
        position: { x: CANVAS_W / 2 - CHKPT_W / 2, y: cpY },
        data: { name: checkpoint.name, checkpointType: checkpoint.type || "approval" },
        width: CHKPT_W,
        height: CHKPT_H,
        measured: { width: CHKPT_W, height: CHKPT_H },
        handles: [
          { id: `${cpId}-tgt`, type: "target" as const, position: Position.Top, x: CHKPT_W / 2, y: 0, width: 8, height: 8 },
          { id: `${cpId}-src`, type: "source" as const, position: Position.Bottom, x: CHKPT_W / 2, y: CHKPT_H, width: 8, height: 8 },
        ],
      } as RFNode);
    }

    tierExitIds.push(cpId ? [cpId] : nodeIds);
    currentY += V_GAP + (cpId ? CHKPT_H + 20 : 0);
  }

  // ── PASS 2: Build edges ───────────────────────────────────────────────────

  function findPlanEdge(fromAgentName: string, toAgentName: string): PlanEdge | undefined {
    const fromObj = agents.find(a => a.name === fromAgentName || a.role === fromAgentName);
    const toObj = agents.find(a => a.name === toAgentName || a.role === toAgentName);
    return (plan.edges || []).find(pe =>
      (pe.from === fromAgentName || pe.from === fromObj?.name || pe.from === fromObj?.role) &&
      (pe.to === toAgentName || pe.to === toObj?.name || pe.to === toObj?.role)
    );
  }

  function isBranchAgent(agentName: string): boolean {
    const obj = agents.find(a => a.name === agentName || a.role === agentName);
    return branchSources.has(agentName) ||
      (obj?.name ? branchSources.has(obj.name) : false) ||
      (obj?.role ? branchSources.has(obj.role) : false);
  }

  for (let ti = 0; ti < tiers.length; ti++) {
    const nodeIds = tierNodeIds[ti];
    const tier = tiers[ti];
    const fromIds: string[] = ti === 0 ? ["orch"] : tierExitIds[ti - 1];
    const isFromOrch = ti === 0;
    const isFromCheckpoint = !isFromOrch && fromIds.length === 1 && fromIds[0].startsWith("cp-");
    const cpId = checkpointByStage.has(ti) ? `cp-${ti}` : null;

    if (isFromOrch) {
      // orch → tier-0 workers
      nodeIds.forEach((nid, ai) => {
        const agentName = tier.agents[ai];
        const agentObj = agents.find(a => a.name === agentName || a.role === agentName);
        const pEdge = (plan.edges || []).find(e =>
          e.to === agentName || e.to === agentObj?.name || e.to === agentObj?.role
        );
        const isConditional = pEdge?.type === "conditional";
        rfEdges.push({
          id: `e-orch-${nid}`,
          source: "orch",
          target: nid,
          sourceHandle: "orch-src",
          targetHandle: `${nid}-tgt`,
          label: pEdge?.label,
          animated: !isConditional,
          type: "smoothstep",
          ...(isConditional ? EDGE_CONDITIONAL : EDGE_SEQUENTIAL),
          ...LABEL_PROPS,
        });
      });
    } else if (isFromCheckpoint) {
      // checkpoint → all tier-ti workers
      const cpSrcId = fromIds[0];
      nodeIds.forEach(nid => {
        rfEdges.push({
          id: `e-${cpSrcId}-${nid}`,
          source: cpSrcId,
          target: nid,
          sourceHandle: `${cpSrcId}-src`,
          targetHandle: `${nid}-tgt`,
          type: "smoothstep",
          ...EDGE_CHECKPOINT,
        });
      });
    } else {
      // Normal inter-tier edges
      const prevNodeIds = tierNodeIds[ti - 1];
      const prevTier = tiers[ti - 1];
      const matrix = plan.agentDependencyMatrix;

      nodeIds.forEach((nid, ai) => {
        const agentName = tier.agents[ai];
        const agentObj = agents.find(a => a.name === agentName || a.role === agentName);
        let connected = false;

        if (matrix) {
          const entry =
            matrix.find(e => e.agent === agentName) ||
            matrix.find(e => e.agent === agentObj?.name) ||
            matrix.find(e => e.agent === agentObj?.role);
          if (entry) {
            prevTier.agents.forEach((prevName, pi) => {
              const prevObj = agents.find(a => a.name === prevName || a.role === prevName);
              const hasDep = entry.dependsOn.some(
                d => d === prevName || d === prevObj?.name || d === prevObj?.role
              );
              if (!hasDep) return;

              const pEdge = findPlanEdge(prevName, agentName);
              const isConditional = pEdge?.type === "conditional";
              const srcNodeId = prevNodeIds[pi];
              // Route through ConditionNode if prev agent is a branch source
              const viaCond = isBranchAgent(prevName);
              const actualSrc = viaCond ? `cond-${srcNodeId}` : srcNodeId;
              const actualSrcHandle = viaCond ? `cond-${srcNodeId}-src` : `${srcNodeId}-src`;

              rfEdges.push({
                id: `e-${srcNodeId}-${nid}`,
                source: actualSrc,
                target: nid,
                sourceHandle: actualSrcHandle,
                targetHandle: `${nid}-tgt`,
                label: pEdge?.label,
                type: "smoothstep",
                ...(isConditional ? EDGE_CONDITIONAL : EDGE_SEQUENTIAL),
                ...LABEL_PROPS,
              });
              connected = true;
            });
          }
        }

        if (!connected) {
          rfEdges.push({
            id: `e-${prevNodeIds[0]}-${nid}-fallback`,
            source: prevNodeIds[0],
            target: nid,
            sourceHandle: `${prevNodeIds[0]}-src`,
            targetHandle: `${nid}-tgt`,
            type: "smoothstep",
            ...EDGE_FALLBACK,
          });
        }
      });
    }

    // Branch-source agents in this tier → their ConditionNodes
    tier.agents.forEach((agentName, ai) => {
      if (!isBranchAgent(agentName)) return;
      const nid = nodeIds[ai];
      const condId = `cond-${nid}`;
      rfEdges.push({
        id: `e-${nid}-${condId}`,
        source: nid,
        target: condId,
        sourceHandle: `${nid}-src`,
        targetHandle: `${condId}-tgt`,
        type: "smoothstep",
        ...EDGE_CONDITIONAL,
        animated: false,
      });
    });

    // Tier nodes → checkpoint (if checkpoint follows this tier)
    if (cpId) {
      nodeIds.forEach(nid => {
        rfEdges.push({
          id: `e-${nid}-${cpId}`,
          source: nid,
          target: cpId,
          sourceHandle: `${nid}-src`,
          targetHandle: `${cpId}-tgt`,
          type: "smoothstep",
          ...EDGE_CHECKPOINT,
        });
      });
    }
  }

  // Fan-out/fan-in aggregator
  if (plan.pattern === "fan_out_fan_in" && tiers.length === 1 && tiers[0].agents.length > 1) {
    const aggId = "aggregate";
    nodes.push({
      id: aggId,
      type: "worker",
      position: { x: CANVAS_W / 2 - NODE_W / 2, y: currentY },
      data: { label: "Aggregate Results", stage: tiers.length, isParallel: false },
      width: NODE_W,
      height: WORKER_H,
      measured: { width: NODE_W, height: WORKER_H },
      handles: [
        { id: `${aggId}-tgt`, type: "target" as const, position: Position.Top, x: NODE_W / 2, y: 0, width: 8, height: 8 },
        { id: `${aggId}-src`, type: "source" as const, position: Position.Bottom, x: NODE_W / 2, y: WORKER_H, width: 8, height: 8 },
      ],
    } as RFNode);
    (tierNodeIds[0] || []).forEach((nid, i) => {
      rfEdges.push({
        id: `e-agg-${i}`,
        source: nid,
        target: aggId,
        sourceHandle: `${nid}-src`,
        targetHandle: `${aggId}-tgt`,
        type: "smoothstep",
        style: { strokeDasharray: "4 2", strokeWidth: 1, stroke: "hsl(var(--muted-foreground) / 0.6)" },
      });
    });
    currentY += V_GAP;
  }

  // Feedback / retry backward edges (route along the left side)
  for (const fb of plan.feedbackEdges || []) {
    const srcId = agentToNodeId.get(fb.from);
    const tgtId = agentToNodeId.get(fb.to);
    if (!srcId || !tgtId || srcId === tgtId) continue;
    rfEdges.push({
      id: `fb-${srcId}-${tgtId}`,
      source: srcId,
      target: tgtId,
      sourceHandle: `${srcId}-lsrc`,
      targetHandle: `${tgtId}-ltgt`,
      label: fb.label || (fb.maxRetries ? `retry ×${fb.maxRetries}` : "retry"),
      type: "smoothstep",
      ...EDGE_FEEDBACK,
      ...LABEL_PROPS,
      labelStyle: { fontSize: 8, fill: "hsl(340 82% 55% / 0.9)" },
    });
  }

  return { nodes, edges: rfEdges, totalH: currentY + 40 };
}

// ── Inner component (controlled, remounted via key) ───────────────────────────

function AgentPlanGraphInner({
  initialNodes,
  initialEdges,
  totalH,
}: {
  initialNodes: RFNode[];
  initialEdges: RFEdge[];
  totalH: number;
}) {
  const [nodes, , onNodesChange] = useNodesState<RFNode>(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState<RFEdge>(initialEdges);

  return (
    <div
      style={{ height: Math.max(320, totalH) }}
      className="relative w-full rounded-lg overflow-hidden border border-border/60 bg-muted/5"
      data-testid="agent-plan-react-flow"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="hsl(var(--muted-foreground) / 0.08)" />
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-border !rounded-lg !shadow-sm"
        />
      </ReactFlow>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export function AgentPlanGraph({
  orchestrator,
  agents,
  plan,
}: {
  orchestrator: PlanAgent;
  agents: PlanAgent[];
  plan: AgentPlan | null;
}) {
  const layout = useMemo(() => {
    if (!plan || agents.length === 0) return null;
    return buildLayout(orchestrator, agents, plan);
  }, [orchestrator, agents, plan]);

  const planKey = `${orchestrator.name}-${agents.length}-${plan?.pattern ?? "none"}-${plan?.humanCheckpoints?.length ?? 0}-${plan?.feedbackEdges?.length ?? 0}`;

  if (!plan || !layout) return null;

  return (
    <ReactFlowProvider>
      <AgentPlanGraphInner
        key={planKey}
        initialNodes={layout.nodes}
        initialEdges={layout.edges}
        totalH={layout.totalH}
      />
    </ReactFlowProvider>
  );
}
