import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: "policy" | "skill" | "ontology" | "agent";
  group?: string;
  severity?: string;
  status?: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  relation: string;
}

interface PolicyData {
  id: string;
  name: string;
  domain: string;
  status: string;
  policyJson?: { rules?: Array<{ rule: string; severity?: string }> } | null;
  ontologyRefs?: string[];
}

interface SkillData {
  id: string;
  name: string;
  industry: string;
  domain: string;
  description: string;
  tags?: string[];
  industryContextId?: string;
}

interface AgentData {
  id: string;
  name: string;
  agentType?: string;
  outcomeId?: string;
  policyBindings?: unknown;
  complianceTags?: string[];
  ontologyTags?: unknown;
}

interface OntologyData {
  id: string;
  label: string;
  category: string;
  industryId: string;
}

interface PolicyImpactGraphProps {
  policies: PolicyData[];
  skills: SkillData[];
  agents: AgentData[];
  ontologyConcepts: OntologyData[];
  filterPolicyIds?: string[];
  height?: number;
  compact?: boolean;
}

const NODE_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  policy: { fill: "#7c3aed", stroke: "#6d28d9", text: "#ffffff" },
  skill: { fill: "#0891b2", stroke: "#0e7490", text: "#ffffff" },
  ontology: { fill: "#a855f7", stroke: "#9333ea", text: "#ffffff" },
  agent: { fill: "#059669", stroke: "#047857", text: "#ffffff" },
};

const NODE_RADII: Record<string, number> = {
  policy: 28,
  skill: 18,
  ontology: 14,
  agent: 20,
};

const LEGEND_ITEMS = [
  { type: "policy", label: "Policy" },
  { type: "skill", label: "Skill" },
  { type: "ontology", label: "Ontology Term" },
  { type: "agent", label: "Agent" },
];

function extractOntologyTermsFromText(text: string): string[] {
  const matches = text.match(/[A-Z][A-Z0-9_]{2,}/g) || [];
  const excluded = new Set(["AND", "NOT", "THE", "FOR", "ALL", "HAS", "ARE", "WITH", "FROM", "INTO", "OVER", "MUST", "JSON", "HTTP", "HTTPS", "REST", "POST", "GET", "PUT", "DELETE", "NULL", "TRUE", "FALSE", "MEDIUM", "HIGH", "LOW", "CRITICAL", "API", "SLA", "KPI", "CRM", "MCP"]);
  return Array.from(new Set(matches.filter(m => !excluded.has(m))));
}

function buildGraph(
  policies: PolicyData[],
  skills: SkillData[],
  agents: AgentData[],
  ontologyConcepts: OntologyData[],
  filterPolicyIds?: string[]
): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const nodeIds = new Set<string>();

  const activePolicies = policies.filter(p => {
    if (p.status !== "active") return false;
    if (filterPolicyIds && filterPolicyIds.length > 0) {
      return filterPolicyIds.includes(p.id);
    }
    return true;
  });

  activePolicies.forEach(p => {
    const nid = `policy-${p.id}`;
    if (!nodeIds.has(nid)) {
      nodeIds.add(nid);
      nodes.push({ id: nid, label: p.name, type: "policy", group: p.domain });
    }
  });

  const ontologyMap = new Map<string, OntologyData>();
  const ontologyByLabel = new Map<string, OntologyData>();
  ontologyConcepts.forEach(o => {
    ontologyMap.set(o.id, o);
    const snakeLabel = o.label.replace(/[\s-]+/g, "_").toUpperCase();
    ontologyByLabel.set(snakeLabel, o);
  });

  const connectedSkillIds = new Set<string>();
  const connectedOntologyIds = new Set<string>();
  const connectedAgentIds = new Set<string>();

  activePolicies.forEach(p => {
    const pNodeId = `policy-${p.id}`;
    const directRefs = Array.isArray(p.ontologyRefs) ? p.ontologyRefs : [];
    const ruleTexts: string[] = [];
    const pj = p.policyJson as { rules?: Array<{ rule: string; severity?: string }> } | null;
    if (pj?.rules) {
      pj.rules.forEach(r => ruleTexts.push(r.rule || ""));
    }
    const allRuleText = ruleTexts.join(" ");
    const extractedTerms = extractOntologyTermsFromText(allRuleText);

    const linkedOntologyIds = new Set<string>();
    directRefs.forEach(ref => {
      if (ontologyMap.has(ref)) linkedOntologyIds.add(ref);
    });
    extractedTerms.forEach(term => {
      const match = ontologyByLabel.get(term);
      if (match) linkedOntologyIds.add(match.id);
    });

    linkedOntologyIds.forEach(oId => {
      connectedOntologyIds.add(oId);
      const oNodeId = `ontology-${oId}`;
      if (!nodeIds.has(oNodeId)) {
        const concept = ontologyMap.get(oId);
        nodeIds.add(oNodeId);
        nodes.push({ id: oNodeId, label: concept?.label || oId, type: "ontology", group: concept?.category });
      }
      links.push({ source: pNodeId, target: oNodeId, relation: "references" });
    });

    const domainAliases: Record<string, string[]> = {
      compliance: ["compliance", "regulatory"],
      data_handling: ["data_handling", "data-handling", "data"],
      access_control: ["access_control", "access-control", "security"],
      audit: ["audit", "logging", "monitoring"],
      tool_permissions: ["tool_permissions", "tool-permissions", "tools"],
    };

    const policyDomains = new Set<string>();
    policyDomains.add(p.domain);
    Object.entries(domainAliases).forEach(([key, aliases]) => {
      if (aliases.includes(p.domain)) {
        policyDomains.add(key);
        aliases.forEach(a => policyDomains.add(a));
      }
    });

    skills.forEach(s => {
      let connected = false;

      if (policyDomains.has(s.domain)) connected = true;

      if (!connected && s.tags) {
        const tagText = s.tags.join(" ").toUpperCase();
        const descUpper = s.description.toUpperCase();
        linkedOntologyIds.forEach(oId => {
          const concept = ontologyMap.get(oId);
          if (concept) {
            const snakeLabel = concept.label.replace(/[\s-]+/g, "_").toUpperCase();
            if (tagText.includes(snakeLabel) || descUpper.includes(snakeLabel)) {
              connected = true;
            }
          }
        });
      }

      if (!connected) {
        const skillDescTerms = extractOntologyTermsFromText(s.description);
        const policyTerms = new Set(extractedTerms);
        for (const t of skillDescTerms) {
          if (policyTerms.has(t)) { connected = true; break; }
        }
      }

      if (connected) {
        connectedSkillIds.add(s.id);
        const sNodeId = `skill-${s.id}`;
        if (!nodeIds.has(sNodeId)) {
          nodeIds.add(sNodeId);
          nodes.push({ id: sNodeId, label: s.name, type: "skill", group: s.domain });
        }
        links.push({ source: pNodeId, target: sNodeId, relation: "constrains" });
      }
    });
  });

  agents.forEach(a => {
    let connected = false;
    const aNodeId = `agent-${a.id}`;

    const bindings = a.policyBindings as string[] | null;
    if (Array.isArray(bindings)) {
      bindings.forEach(bid => {
        const matchedPolicy = activePolicies.find(p => p.id === bid || p.name === bid);
        if (matchedPolicy) {
          connected = true;
          if (!nodeIds.has(aNodeId)) {
            nodeIds.add(aNodeId);
            connectedAgentIds.add(a.id);
            nodes.push({ id: aNodeId, label: a.name, type: "agent", group: a.agentType });
          }
          links.push({ source: aNodeId, target: `policy-${matchedPolicy.id}`, relation: "bound-to" });
        }
      });
    }

    const oTags = a.ontologyTags as string[] | null;
    if (Array.isArray(oTags)) {
      oTags.forEach(tag => {
        if (connectedOntologyIds.has(tag)) {
          if (!nodeIds.has(aNodeId)) {
            nodeIds.add(aNodeId);
            connectedAgentIds.add(a.id);
            nodes.push({ id: aNodeId, label: a.name, type: "agent", group: a.agentType });
          }
          links.push({ source: aNodeId, target: `ontology-${tag}`, relation: "uses-concept" });
          connected = true;
        }
      });
    }

    if (!connected && a.outcomeId) {
      if (activePolicies.length > 0) {
        if (!nodeIds.has(aNodeId)) {
          nodeIds.add(aNodeId);
          connectedAgentIds.add(a.id);
          nodes.push({ id: aNodeId, label: a.name, type: "agent", group: a.agentType });
        }
        activePolicies.forEach(pol => {
          links.push({ source: aNodeId, target: `policy-${pol.id}`, relation: "governed-by" });
        });
      }
    }
  });

  return { nodes, links };
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "\u2026";
}

export function PolicyImpactGraph({
  policies,
  skills,
  agents,
  ontologyConcepts,
  filterPolicyIds,
  height = 500,
  compact = false,
}: PolicyImpactGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const animFrameRef = useRef<number>(0);

  const { nodes, links } = useMemo(() =>
    buildGraph(policies, skills, agents, ontologyConcepts, filterPolicyIds),
    [policies, skills, agents, ontologyConcepts, filterPolicyIds]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [height]);

  const highlightedIds = useMemo(() => {
    const active = selectedNode || hoveredNode;
    if (!active) return null;
    const ids = new Set<string>([active]);
    links.forEach(l => {
      const sid = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      if (sid === active) ids.add(tid);
      if (tid === active) ids.add(sid);
    });
    return ids;
  }, [selectedNode, hoveredNode, links]);

  useEffect(() => {
    nodesRef.current = nodes.map(n => ({ ...n }));
    linksRef.current = links.map(l => ({ ...l }));

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<GraphNode>(nodesRef.current)
      .force("link", forceLink<GraphNode, GraphLink>(linksRef.current)
        .id(d => d.id)
        .distance(d => {
          const src = d.source as GraphNode;
          const tgt = d.target as GraphNode;
          if (src.type === "policy" && tgt.type === "ontology") return 80;
          if (src.type === "policy" && tgt.type === "skill") return 120;
          return 100;
        })
        .strength(0.4))
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force("collide", forceCollide<GraphNode>(d => NODE_RADII[d.type] + 8))
      .force("x", forceX(dimensions.width / 2).strength(0.04))
      .force("y", forceY(dimensions.height / 2).strength(0.04));

    simRef.current = sim;

    sim.on("tick", () => {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(() => draw());
    });

    return () => {
      sim.stop();
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [nodes, links, dimensions]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);

    linksRef.current.forEach(l => {
      const src = l.source as GraphNode;
      const tgt = l.target as GraphNode;
      if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return;

      let alpha = 0.3;
      if (highlightedIds) {
        const sid = src.id;
        const tid = tgt.id;
        if (highlightedIds.has(sid) && highlightedIds.has(tid)) {
          alpha = 0.9;
        } else {
          alpha = 0.06;
        }
      }

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);

      const gradient = ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y);
      const srcColor = NODE_COLORS[src.type];
      const tgtColor = NODE_COLORS[tgt.type];
      gradient.addColorStop(0, srcColor.fill);
      gradient.addColorStop(1, tgtColor.fill);
      ctx.strokeStyle = gradient;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = alpha > 0.5 ? 2 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    nodesRef.current.forEach(n => {
      if (n.x == null || n.y == null) return;
      const r = NODE_RADII[n.type];
      const colors = NODE_COLORS[n.type];

      let nodeAlpha = 1;
      if (highlightedIds && !highlightedIds.has(n.id)) {
        nodeAlpha = 0.15;
      }

      const isActive = n.id === selectedNode || n.id === hoveredNode;

      ctx.globalAlpha = nodeAlpha;

      if (isActive) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = colors.fill;
        ctx.globalAlpha = nodeAlpha * 0.2;
        ctx.fill();
        ctx.globalAlpha = nodeAlpha;
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.fill;
      ctx.fill();
      ctx.strokeStyle = isActive ? "#ffffff" : colors.stroke;
      ctx.lineWidth = isActive ? 2.5 : 1.5;
      ctx.stroke();

      const icon = n.type === "policy" ? "\u229B" : n.type === "skill" ? "\u2699" : n.type === "ontology" ? "\u25C6" : "\u2B22";
      ctx.fillStyle = colors.text;
      ctx.font = `${r * 0.7}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, n.x, n.y);

      const maxLen = compact ? 12 : n.type === "policy" ? 22 : 16;
      const label = truncateLabel(n.label, maxLen);
      ctx.font = `${n.type === "policy" ? "bold " : ""}${compact ? 9 : 10}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = highlightedIds && !highlightedIds.has(n.id) ? "rgba(120,120,120,0.3)" : "rgba(150,150,150,0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, n.x, n.y + r + 4);

      ctx.globalAlpha = 1;
    });

    ctx.restore();
  }, [dimensions, transform, highlightedIds, selectedNode, hoveredNode, compact]);

  useEffect(() => { draw(); }, [draw]);

  const screenToGraph = useCallback((sx: number, sy: number) => {
    return {
      x: (sx - transform.x) / transform.k,
      y: (sy - transform.y) / transform.k,
    };
  }, [transform]);

  const findNodeAt = useCallback((mx: number, my: number): GraphNode | null => {
    const { x, y } = screenToGraph(mx, my);
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      if (n.x == null || n.y == null) continue;
      const r = NODE_RADII[n.type] + 4;
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }, [screenToGraph]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanning) {
      setTransform(prev => ({
        ...prev,
        x: prev.x + (e.clientX - panStart.current.x),
        y: prev.y + (e.clientY - panStart.current.y),
      }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const node = findNodeAt(mx, my);
    if (node) {
      setHoveredNode(node.id);
      setTooltip({ x: mx, y: my, node });
      if (canvasRef.current) canvasRef.current.style.cursor = "pointer";
    } else {
      setHoveredNode(null);
      setTooltip(null);
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    }
  }, [isPanning, findNodeAt]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    setSelectedNode(prev => node ? (prev === node.id ? null : node.id) : null);
  }, [findNodeAt]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(prev => {
      const newK = Math.max(0.2, Math.min(3, prev.k * factor));
      return {
        k: newK,
        x: mx - (mx - prev.x) * (newK / prev.k),
        y: my - (my - prev.y) * (newK / prev.k),
      };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = findNodeAt(mx, my);
    if (!node) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    }
  }, [findNodeAt]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    if (canvasRef.current) canvasRef.current.style.cursor = "grab";
  }, []);

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 });
    setSelectedNode(null);
    setHoveredNode(null);
  }, []);

  const zoomIn = useCallback(() => {
    setTransform(prev => ({ ...prev, k: Math.min(3, prev.k * 1.3) }));
  }, []);

  const zoomOut = useCallback(() => {
    setTransform(prev => ({ ...prev, k: Math.max(0.2, prev.k / 1.3) }));
  }, []);

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return nodesRef.current.find(n => n.id === selectedNode) || null;
  }, [selectedNode]);

  const connectedCount = useMemo(() => {
    if (!selectedNode) return { policies: 0, skills: 0, ontology: 0, agents: 0 };
    const connected = new Set<string>();
    links.forEach(l => {
      const sid = typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
      const tid = typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
      if (sid === selectedNode) connected.add(tid);
      if (tid === selectedNode) connected.add(sid);
    });
    const counts = { policies: 0, skills: 0, ontology: 0, agents: 0 };
    connected.forEach(id => {
      if (id.startsWith("policy-")) counts.policies++;
      else if (id.startsWith("skill-")) counts.skills++;
      else if (id.startsWith("ontology-")) counts.ontology++;
      else if (id.startsWith("agent-")) counts.agents++;
    });
    return counts;
  }, [selectedNode, links]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm py-16" data-testid="impact-graph-empty">
        No active policies with connected skills, agents, or ontology terms to visualize.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" data-testid="policy-impact-graph">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={zoomIn} data-testid="button-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={zoomOut} data-testid="button-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={resetView} data-testid="button-reset-view">
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {!compact && (
        <div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-3">
          {LEGEND_ITEMS.map(item => (
            <div key={item.type} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: NODE_COLORS[item.type].fill }}
              />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: dimensions.width, height: dimensions.height, cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredNode(null); setTooltip(null); setIsPanning(false); }}
        data-testid="impact-graph-canvas"
      />

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none bg-popover border border-border rounded-md shadow-md px-3 py-2 max-w-[220px]"
          style={{
            left: Math.min(tooltip.x + 12, dimensions.width - 230),
            top: Math.min(tooltip.y + 12, dimensions.height - 80),
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[tooltip.node.type].fill }}
            />
            <span className="text-xs font-medium capitalize">{tooltip.node.type}</span>
          </div>
          <p className="text-[11px] text-foreground font-medium">{tooltip.node.label}</p>
          {tooltip.node.group && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{tooltip.node.group}</p>
          )}
        </div>
      )}

      {selectedNodeData && !compact && (
        <div className="absolute bottom-2 left-2 z-10 bg-popover border border-border rounded-md shadow-md px-3 py-2 max-w-[280px]" data-testid="impact-graph-details">
          <div className="flex items-center gap-2 mb-1.5">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: NODE_COLORS[selectedNodeData.type].fill }}
            />
            <span className="text-xs font-semibold">{selectedNodeData.label}</span>
            <Badge variant="outline" className="text-[9px] ml-auto capitalize">{selectedNodeData.type}</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {connectedCount.policies > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {connectedCount.policies} {connectedCount.policies === 1 ? "policy" : "policies"}
              </Badge>
            )}
            {connectedCount.skills > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {connectedCount.skills} {connectedCount.skills === 1 ? "skill" : "skills"}
              </Badge>
            )}
            {connectedCount.ontology > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {connectedCount.ontology} {connectedCount.ontology === 1 ? "term" : "terms"}
              </Badge>
            )}
            {connectedCount.agents > 0 && (
              <Badge variant="secondary" className="text-[9px]">
                {connectedCount.agents} {connectedCount.agents === 1 ? "agent" : "agents"}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">Click again to deselect. Connected nodes highlighted.</p>
        </div>
      )}

      {!compact && (
        <div className="absolute bottom-2 right-2 z-10">
          <span className="text-[10px] text-muted-foreground">
            {nodes.length} nodes &middot; {links.length} edges
          </span>
        </div>
      )}
    </div>
  );
}