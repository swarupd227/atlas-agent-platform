import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import type { Skill, SkillChain } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  Search,
  GripVertical,
  Link2,
  Unlink,
  Gauge,
  Shield,
  X,
  ArrowRight,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ChainNode {
  id: string;
  skillId: string;
  skillName: string;
  description: string;
  industry: string;
  x: number;
  y: number;
  estimatedTokens: number;
}

interface ChainEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
}

interface Conflict {
  skillA: string;
  skillB: string;
  type: "contradiction" | "overlap" | "ordering";
  description: string;
  severity: "high" | "medium" | "low";
  resolution: string;
}

const TOKEN_ESTIMATES: Record<string, number> = {
  beginner: 800,
  intermediate: 1500,
  advanced: 2500,
  expert: 4000,
};

const CONTEXT_WINDOW_LIMIT = 128000;

function estimateTokens(skill: Skill): number {
  const baseTokens = TOKEN_ESTIMATES[skill.complexity] || 1500;
  const descriptionTokens = Math.ceil((skill.description?.length || 0) / 4);
  const bodyTokens = Math.ceil((skill.markdownBody?.length || 0) / 4);
  return baseTokens + descriptionTokens + bodyTokens;
}

function ComposerLanding() {
  const [, navigate] = useLocation();
  const { data: chains = [], isLoading } = useQuery<SkillChain[]>({ queryKey: ["/api/skill-chains"] });
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiRequest("POST", "/api/skill-chains", {
        name: "New Skill Chain",
        description: "",
        nodes: [],
        edges: [],
        conflicts: [],
        status: "draft",
        industry: "financial_services",
      });
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/skill-chains"] });
      navigate(`/skills/composer/${created.id}`);
    } catch (e: any) {
      toast({ title: "Failed to create chain", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-composer-title">Skill Composition Designer</h1>
            <p className="text-sm text-muted-foreground mt-1">Compose skill chains where outputs flow from one skill to the next</p>
          </div>
          <Button onClick={handleCreate} disabled={creating} data-testid="button-create-chain">
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            New Chain
          </Button>
        </div>
        <Separator />
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          </div>
        ) : chains.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Link2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No skill chains yet. Create your first chain to compose skills together.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chains.map((c) => {
              const nodeCount = (c.nodes as ChainNode[] | null)?.length || 0;
              const edgeCount = (c.edges as ChainEdge[] | null)?.length || 0;
              return (
                <Link key={c.id} href={`/skills/composer/${c.id}`}>
                  <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-chain-${c.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm leading-tight">{c.name}</CardTitle>
                        <Badge variant={c.status === "active" ? "default" : "secondary"} className="text-[10px] shrink-0">{c.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description || "No description"}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{nodeCount} skills</Badge>
                        <Badge variant="outline" className="text-[10px]">{edgeCount} connections</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

export default function SkillComposer() {
  const [, params] = useRoute("/skills/composer/:id");
  const id = params?.id;
  if (!id) return <ComposerLanding />;
  return <ComposerEditor chainId={id} />;
}

function ComposerEditor({ chainId }: { chainId: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const canvasRef = useRef<HTMLDivElement>(null);

  const { data: chain, isLoading: chainLoading } = useQuery<SkillChain>({
    queryKey: ["/api/skill-chains", chainId],
  });
  const { data: allSkills = [] } = useQuery<Skill[]>({ queryKey: ["/api/skills"] });

  const [chainName, setChainName] = useState("New Skill Chain");
  const [chainDesc, setChainDesc] = useState("");
  const [nodes, setNodes] = useState<ChainNode[]>([]);
  const [edges, setEdges] = useState<ChainEdge[]>([]);
  const [saving, setSaving] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [showConflicts, setShowConflicts] = useState(true);
  const [showBudget, setShowBudget] = useState(true);

  useEffect(() => {
    if (chain) {
      setChainName(chain.name);
      setChainDesc(chain.description || "");
      setNodes((chain.nodes as ChainNode[]) || []);
      setEdges((chain.edges as ChainEdge[]) || []);
      setConflicts((chain.conflicts as Conflict[]) || []);
    }
  }, [chain]);

  const filteredSkills = allSkills.filter(s =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
    s.domain?.toLowerCase().includes(skillSearch.toLowerCase())
  );

  const addSkillToCanvas = (skill: Skill) => {
    const existingIds = nodes.map(n => n.skillId);
    if (existingIds.includes(skill.id)) {
      toast({ title: "Skill already in chain" });
      return;
    }
    const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x)) : 0;
    const newNode: ChainNode = {
      id: `node-${Date.now()}`,
      skillId: skill.id,
      skillName: skill.name,
      description: skill.description,
      industry: skill.industry,
      x: maxX + 280,
      y: 120,
      estimatedTokens: estimateTokens(skill),
    };
    setNodes(prev => [...prev, newNode]);
  };

  const removeNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId));
    if (connecting === nodeId) setConnecting(null);
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setDraggingNode(nodeId);
    setDragOffset({
      x: e.clientX - rect.left - node.x + canvas.scrollLeft,
      y: e.clientY - rect.top - node.y + canvas.scrollTop,
    });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const newX = Math.max(0, e.clientX - rect.left - dragOffset.x + canvas.scrollLeft);
    const newY = Math.max(0, e.clientY - rect.top - dragOffset.y + canvas.scrollTop);
    setNodes(prev => prev.map(n =>
      n.id === draggingNode ? { ...n, x: newX, y: newY } : n
    ));
  }, [draggingNode, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
  }, []);

  const handleNodeClick = (nodeId: string) => {
    if (draggingNode) return;
    if (connecting) {
      if (connecting !== nodeId) {
        const existingEdge = edges.find(e =>
          (e.sourceId === connecting && e.targetId === nodeId) ||
          (e.sourceId === nodeId && e.targetId === connecting)
        );
        if (!existingEdge) {
          setEdges(prev => [...prev, {
            id: `edge-${Date.now()}`,
            sourceId: connecting,
            targetId: nodeId,
            label: "output → input",
          }]);
        }
      }
      setConnecting(null);
    } else {
      setConnecting(nodeId);
    }
  };

  const removeEdge = (edgeId: string) => {
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PATCH", `/api/skill-chains/${chainId}`, {
        name: chainName,
        description: chainDesc,
        nodes,
        edges,
        conflicts,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/skill-chains", chainId] });
      queryClient.invalidateQueries({ queryKey: ["/api/skill-chains"] });
      toast({ title: "Chain saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const analyzeConflicts = async () => {
    if (nodes.length < 2) {
      toast({ title: "Need at least 2 skills to analyze conflicts" });
      return;
    }
    setConflictsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/ai/skill-chain-conflicts", { nodes });
      const data = await res.json();
      setConflicts(data.conflicts || []);
      setShowConflicts(true);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setConflictsLoading(false);
    }
  };

  const totalTokens = nodes.reduce((sum, n) => sum + n.estimatedTokens, 0);
  const budgetPercent = Math.min(100, (totalTokens / CONTEXT_WINDOW_LIMIT) * 100);
  const budgetColor = budgetPercent > 80 ? "bg-red-500" : budgetPercent > 60 ? "bg-yellow-500" : "bg-green-500";
  const budgetTextColor = budgetPercent > 80 ? "text-red-600 dark:text-red-400" : budgetPercent > 60 ? "text-yellow-600 dark:text-yellow-400" : "text-green-600 dark:text-green-400";

  const getEdgePath = (edge: ChainEdge) => {
    const source = nodes.find(n => n.id === edge.sourceId);
    const target = nodes.find(n => n.id === edge.targetId);
    if (!source || !target) return "";
    const sx = source.x + 120;
    const sy = source.y + 50;
    const tx = target.x + 120;
    const ty = target.y + 50;
    const midX = (sx + tx) / 2;
    return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
  };

  if (chainLoading) {
    return (
      <div className="p-5 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="page-skill-composer">
      <div className="flex items-center gap-3 p-3 border-b shrink-0 sticky top-0 z-50 bg-background flex-wrap">
        <Link href="/skills/composer">
          <Button variant="ghost" size="icon" data-testid="button-back-composer">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Input
          value={chainName}
          onChange={e => setChainName(e.target.value)}
          className="max-w-xs text-sm font-semibold border-none bg-transparent focus-visible:ring-1 h-9"
          data-testid="input-chain-name"
        />
        <Badge variant="secondary" className="text-xs">{nodes.length} skills</Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={analyzeConflicts} disabled={conflictsLoading || nodes.length < 2} data-testid="button-analyze-conflicts">
          {conflictsLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Shield className="w-3.5 h-3.5 mr-1.5" />}
          Analyze Conflicts
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} data-testid="button-save-chain">
          {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
          Save
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-64 border-r flex flex-col shrink-0">
          <div className="p-3 border-b space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Skill Library</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={skillSearch}
                onChange={e => setSkillSearch(e.target.value)}
                placeholder="Search skills..."
                className="pl-8 h-8 text-xs"
                data-testid="input-skill-search"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredSkills.map(skill => (
                <div
                  key={skill.id}
                  className="p-2 rounded-md cursor-pointer hover-elevate group"
                  onClick={() => addSkillToCanvas(skill)}
                  data-testid={`skill-add-${skill.id}`}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{skill.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{skill.domain} &middot; {skill.complexity}</p>
                    </div>
                    <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" style={{ visibility: "visible" }} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div
            ref={canvasRef}
            className="flex-1 relative overflow-auto bg-muted/30"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            data-testid="canvas-area"
            style={{ minHeight: 400 }}
          >
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-2">
                  <Link2 className="w-10 h-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground/50">Click skills from the library on the left to add them to the canvas</p>
                  <p className="text-xs text-muted-foreground/40">Then click two nodes to connect them</p>
                </div>
              </div>
            )}

            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: "100%", minHeight: "100%" }}>
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" fill="hsl(var(--primary))">
                  <polygon points="0 0, 10 3.5, 0 7" />
                </marker>
              </defs>
              {edges.map(edge => {
                const path = getEdgePath(edge);
                if (!path) return null;
                return (
                  <g key={edge.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                      opacity={0.6}
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="16"
                      className="cursor-pointer pointer-events-auto"
                      onClick={() => removeEdge(edge.id)}
                    />
                  </g>
                );
              })}
            </svg>

            {nodes.map(node => {
              const isConnecting = connecting === node.id;
              const hasConflict = conflicts.some(c => c.skillA === node.skillName || c.skillB === node.skillName);
              return (
                <div
                  key={node.id}
                  className={`absolute select-none ${draggingNode === node.id ? "z-30" : "z-20"}`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width: 240,
                  }}
                  data-testid={`canvas-node-${node.id}`}
                >
                  <Card className={`${isConnecting ? "ring-2 ring-primary" : ""} ${hasConflict ? "ring-2 ring-destructive" : ""}`}>
                    <div
                      className="px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing border-b"
                      onMouseDown={(e) => handleMouseDown(e, node.id)}
                    >
                      <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-xs font-semibold truncate flex-1">{node.skillName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                        data-testid={`button-remove-node-${node.id}`}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{node.description}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{node.industry?.replace(/_/g, " ")}</Badge>
                        <Badge variant="outline" className="text-[10px]">{node.estimatedTokens.toLocaleString()} tokens</Badge>
                      </div>
                      <Button
                        variant={isConnecting ? "default" : "outline"}
                        size="sm"
                        className="w-full"
                        onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                        data-testid={`button-connect-${node.id}`}
                      >
                        {isConnecting ? (
                          <><Unlink className="w-3 h-3 mr-1" /> Click another node</>
                        ) : (
                          <><Link2 className="w-3 h-3 mr-1" /> Connect</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>

          <div className="border-t bg-background">
            <div className="flex items-center gap-2 px-3 py-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowBudget(!showBudget)} data-testid="button-toggle-budget">
                <Gauge className="w-3.5 h-3.5 mr-1" />
                Context Budget
                {showBudget ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronUp className="w-3 h-3 ml-1" />}
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowConflicts(!showConflicts)} data-testid="button-toggle-conflicts">
                <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                Conflicts {conflicts.length > 0 && <Badge variant="destructive" className="text-[9px] ml-1 px-1">{conflicts.length}</Badge>}
                {showConflicts ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronUp className="w-3 h-3 ml-1" />}
              </Button>
            </div>

            {showBudget && (
              <div className="px-4 pb-3 space-y-2" data-testid="panel-budget">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Context Window Usage</span>
                  <span className={budgetTextColor + " font-medium"}>{totalTokens.toLocaleString()} / {CONTEXT_WINDOW_LIMIT.toLocaleString()} tokens ({budgetPercent.toFixed(1)}%)</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${budgetColor}`} style={{ width: `${budgetPercent}%` }} />
                </div>
                {nodes.length > 0 && (
                  <div className="flex items-start gap-4 flex-wrap">
                    {nodes.map(n => (
                      <div key={n.id} className="text-[10px] text-muted-foreground">
                        <span className="font-medium text-foreground">{n.skillName}</span>: {n.estimatedTokens.toLocaleString()} tokens
                      </div>
                    ))}
                  </div>
                )}
                {budgetPercent > 60 && (
                  <Card className="border-dashed">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-xs font-medium">Compression Strategies</p>
                          {budgetPercent > 80 ? (
                            <ul className="text-[11px] text-muted-foreground space-y-0.5">
                              <li>- Switch lower-priority skills to <strong>load-on-demand</strong> mode (loaded only when their trigger fires)</li>
                              <li>- Use skill <strong>summarization</strong> for documentation-heavy skills</li>
                              <li>- Consider splitting this chain into <strong>sub-chains</strong></li>
                            </ul>
                          ) : (
                            <ul className="text-[11px] text-muted-foreground space-y-0.5">
                              <li>- Consider using <strong>load-on-demand</strong> for non-critical skills</li>
                              <li>- Review skill descriptions for unnecessary verbosity</li>
                            </ul>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {showConflicts && conflicts.length > 0 && (
              <div className="px-4 pb-3 space-y-2" data-testid="panel-conflicts">
                <p className="text-xs font-semibold text-muted-foreground">Detected Conflicts</p>
                {conflicts.map((conflict, i) => (
                  <Card key={i} className={`border-l-4 ${conflict.severity === "high" ? "border-l-red-500" : conflict.severity === "medium" ? "border-l-yellow-500" : "border-l-blue-500"}`}>
                    <CardContent className="p-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <AlertTriangle className={`w-3.5 h-3.5 ${conflict.severity === "high" ? "text-red-500" : conflict.severity === "medium" ? "text-yellow-500" : "text-blue-500"}`} />
                        <Badge variant={conflict.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">{conflict.severity}</Badge>
                        <Badge variant="outline" className="text-[10px]">{conflict.type}</Badge>
                        <span className="text-[10px] text-muted-foreground">{conflict.skillA} &harr; {conflict.skillB}</span>
                      </div>
                      <p className="text-xs">{conflict.description}</p>
                      <p className="text-[11px] text-muted-foreground"><strong>Resolution:</strong> {conflict.resolution}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
