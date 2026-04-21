import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import type { Blueprint, Agent } from "@shared/schema";

interface McpResourceBrief {
  id: string;
  uri: string;
  name: string;
  mimeType: string | null;
  sensitivityLevel: string;
  approvalStatus: string;
  serverName: string;
}

interface McpPromptBrief {
  id: string;
  name: string;
  description: string | null;
  arguments: Array<{ name: string; description: string; required: boolean }> | null;
  publishedStatus: string;
  approvalStatus: string;
  serverName: string;
}

interface PromptBinding {
  promptId: string;
  argumentMappings: Record<string, string>;
}

interface McpServerBrief {
  id: string;
  name: string;
  description: string | null;
  status: string;
  expectedProtocolVersion: string | null;
  riskTier: string;
}

interface McpToolBrief {
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

interface McpDependency {
  serverId: string;
  pinnedVersion: string;
}

interface ContextPlanEntry {
  resourceId: string;
  retrievalStrategy: "eager" | "lazy" | "on-demand";
}
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Brain, Wrench, Database, GitBranch, Split, UserCheck, Shield,
  Plus, Trash2, Save, Play, PenTool, ArrowLeft, AlertTriangle,
  CheckCircle, ChevronDown, ChevronRight, X, MousePointer, Link2, FileText, MessageSquare, Server, Network,
  Scale, BookMarked, Diff, Globe2, Lock, Crown, Copy, Eye, Code2, SendHorizonal,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import TeamGraphEditor from "./team-graph-editor";

type BpNode = { id: string; type: string; label: string; [key: string]: any };
type BpEdge = { from: string; to: string };
type ValidationItem = { type: string; severity: string; message: string; nodeId?: string };
type ValidationResults = { passed: boolean; errors: ValidationItem[]; warnings: ValidationItem[]; compiledAt?: string; summary?: any };

const NODE_TYPES = [
  { type: "llm_call", label: "LLM Call", icon: Brain },
  { type: "tool_call", label: "Tool Call", icon: Wrench },
  { type: "rag", label: "RAG Retrieval", icon: Database },
  { type: "classifier", label: "Classifier", icon: GitBranch },
  { type: "router", label: "Router", icon: Split },
  { type: "human_review", label: "Human Review", icon: UserCheck },
  { type: "schema_validate", label: "Schema Validate", icon: Shield },
] as const;

const NODE_BG_COLORS: Record<string, string> = {
  llm_call: "bg-blue-500", tool_call: "bg-amber-500", rag: "bg-purple-500",
  classifier: "bg-cyan-500", router: "bg-emerald-500", human_review: "bg-orange-500",
  schema_validate: "bg-gray-500",
};

const NODE_ICON_MAP: Record<string, typeof Brain> = {
  llm_call: Brain, tool_call: Wrench, rag: Database, classifier: GitBranch,
  router: Split, human_review: UserCheck, schema_validate: Shield,
};

function StatusBadgeForBlueprint({ status }: { status: string }) {
  if (status === "compiled") return <Badge variant="outline" className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" data-testid="badge-status">{status}</Badge>;
  if (status === "signed") return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" data-testid="badge-status">{status}</Badge>;
  return <Badge variant="default" data-testid="badge-status">{status}</Badge>;
}

let nodeCounter = 0;

export default function BlueprintDetail() {
  const [, params] = useRoute("/blueprints/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data: blueprint, isLoading } = useQuery<Blueprint>({
    queryKey: ["/api/blueprints", id],
    enabled: !!id,
  });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: mcpResources } = useQuery<McpResourceBrief[]>({ queryKey: ["/api/mcp-resources"] });
  const { data: mcpPrompts } = useQuery<McpPromptBrief[]>({ queryKey: ["/api/mcp-prompts"] });
  const { data: mcpServers } = useQuery<McpServerBrief[]>({ queryKey: ["/api/mcp-servers"] });
  const { data: mcpTools } = useQuery<McpToolBrief[]>({ queryKey: ["/api/mcp-tools"] });
  const { data: ontologyReadiness, isLoading: ontologyReadinessLoading } = useQuery<{
    ready: boolean;
    overallScore: number;
    tools: Array<{
      toolName: string;
      serverId: string;
      serverName: string;
      alignmentScore: number;
      matchedParams: number;
      totalParams: number;
      unmatchedParams: string[];
    }>;
    warnings: string[];
  }>({
    queryKey: ["/api/blueprints", id, "ontology-readiness"],
    enabled: !!id,
  });

  const [nodes, setNodes] = useState<BpNode[]>([]);
  const [edges, setEdges] = useState<BpEdge[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [edgeMode, setEdgeMode] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<"properties" | "validation" | "changes">("properties");
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signedBy, setSignedBy] = useState("");
  const [blueprintName, setBlueprintName] = useState("");
  const [localValidation, setLocalValidation] = useState<ValidationResults | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [contextSourcesOpen, setContextSourcesOpen] = useState(false);
  const [promptNodesOpen, setPromptNodesOpen] = useState(false);
  const [attachedResourceIds, setAttachedResourceIds] = useState<Set<string>>(new Set());
  const [promptBindings, setPromptBindings] = useState<PromptBinding[]>([]);
  const [mcpDependencies, setMcpDependencies] = useState<McpDependency[]>([]);
  const [contextPlan, setContextPlan] = useState<ContextPlanEntry[]>([]);
  const [depsOpen, setDepsOpen] = useState(false);
  const [editorView, setEditorView] = useState<"single" | "team">("single");
  const [savedSnapshot, setSavedSnapshot] = useState<BpNode[]>([]);
  const [kgBindings, setKgBindings] = useState<string[]>([]);
  const [kgBindingsOpen, setKgBindingsOpen] = useState(false);
  const [ontologyReadinessOpen, setOntologyReadinessOpen] = useState(false);
  const [businessView, setBusinessView] = useState(false);

  const BUSINESS_LABEL_MAP: Record<string, string> = {
    llm_call: "AI Reasoning Step",
    rag: "Knowledge Search",
    tool_call: "System Action",
    schema_validate: "Data Check",
    human_review: "Expert Approval",
    classifier: "Decision Point",
    router: "Flow Branch",
  };

  const getNodeDisplayLabel = (node: BpNode) => {
    if (!businessView) return node.label;
    const bj = blueprint?.blueprintJson as any;
    const processSteps: Array<{ label: string }> | undefined = bj?.metadata?.processFlowSteps;
    if (processSteps && processSteps.length > 0) {
      const idx = (blueprint?.blueprintJson as any)?.nodes?.findIndex((n: any) => n.id === node.id);
      if (idx != null && idx >= 0 && processSteps[idx]) return processSteps[idx].label;
    }
    return BUSINESS_LABEL_MAP[node.type] || node.label;
  };

  useEffect(() => {
    if (blueprint) {
      const bj = blueprint.blueprintJson as any;
      setNodes(bj?.nodes || []);
      setEdges(bj?.edges || []);
      setBlueprintName(blueprint.name);
      setDirty(false);
      setSavedSnapshot(bj?.nodes || []);
      setKgBindings(bj?.kgBindings || []);
      if (blueprint.validationResults) setLocalValidation(blueprint.validationResults as ValidationResults);
      if (bj?.contextSources) setAttachedResourceIds(new Set(bj.contextSources));
      if (bj?.promptBindings) setPromptBindings(bj.promptBindings);
      if (bj?.mcpDependencies) setMcpDependencies(bj.mcpDependencies);
      if (bj?.contextPlan) setContextPlan(bj.contextPlan);
    }
  }, [blueprint]);

  const linkedAgent = useMemo(() => {
    if (!blueprint?.agentId || !agents) return null;
    return agents.find(a => a.id === blueprint.agentId);
  }, [blueprint, agents]);

  const invalidNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const vr = localValidation;
    if (!vr) return ids;
    [...(vr.errors || []), ...(vr.warnings || [])].forEach(item => { if (item.nodeId) ids.add(item.nodeId); });
    return ids;
  }, [localValidation]);

  const versionHistory = useMemo(() => {
    if (!blueprint?.versionHistory) return [];
    return Array.isArray(blueprint.versionHistory) ? (blueprint.versionHistory as any[]) : [];
  }, [blueprint]);

  const addNode = useCallback((type: string) => {
    const def = NODE_TYPES.find(n => n.type === type);
    nodeCounter++;
    const newNode: BpNode = { id: `node_${Date.now()}_${nodeCounter}`, type, label: def?.label || type };
    setNodes(prev => [...prev, newNode]);
    setDirty(true);
    setSelectedNodeId(newNode.id);
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setEdges(prev => prev.filter(e => e.from !== nodeId && e.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setDirty(true);
  }, [selectedNodeId]);

  const updateNode = useCallback((nodeId: string, updates: Partial<BpNode>) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...updates } : n));
    setDirty(true);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (edgeMode) {
      if (edgeMode !== nodeId) {
        setEdges(prev => {
          if (prev.some(e => e.from === edgeMode && e.to === nodeId)) return prev;
          return [...prev, { from: edgeMode, to: nodeId }];
        });
        setDirty(true);
      }
      setEdgeMode(null);
    } else {
      setSelectedNodeId(nodeId);
      setRightPanel("properties");
    }
  }, [edgeMode]);

  const deleteEdge = useCallback((from: string, to: string) => {
    setEdges(prev => prev.filter(e => !(e.from === from && e.to === to)));
    setDirty(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/blueprints/${id}`, {
        blueprintJson: { nodes, edges, contextSources: Array.from(attachedResourceIds), promptBindings, mcpDependencies, contextPlan, kgBindings },
        name: blueprintName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      setDirty(false);
      setSavedSnapshot([...nodes]);
      toast({ title: "Blueprint saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/blueprints/${id}`, { isShared: !blueprint?.isShared });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      toast({ title: blueprint?.isShared ? "Blueprint unshared" : "Blueprint shared to org" });
    },
    onError: (err: Error) => toast({ title: "Failed to update sharing", description: err.message, variant: "destructive" }),
  });

  const compileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/blueprints/${id}/compile`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      const vr = data.validationResults as ValidationResults;
      const complianceErrors: ValidationItem[] = [];
      const complianceWarnings: ValidationItem[] = [];
      const tags = linkedAgent?.complianceTags as string[] | null | undefined;
      if (tags && tags.length > 0) {
        if (tags.includes("HIPAA")) {
          if (!nodes.some(n => n.type === "schema_validate")) {
            complianceErrors.push({ type: "compliance", severity: "error", message: "HIPAA \u00A7164.502(b): Blueprint requires a Schema Validate node for PHI redaction." });
          }
        }
        if (tags.includes("PCI-DSS")) {
          if (!nodes.some(n => n.type === "human_review")) {
            complianceErrors.push({ type: "compliance", severity: "error", message: "PCI-DSS Req 7: Blueprint requires a Human Review node for access control." });
          }
        }
        if (tags.includes("EU AI Act")) {
          if (!nodes.some(n => n.type === "human_review")) {
            complianceErrors.push({ type: "compliance", severity: "error", message: "EU AI Act Article 14: Blueprint requires a Human Review node for human oversight." });
          }
        }
        if (tags.includes("SOC 2")) {
          nodes.filter(n => n.type === "tool_call").forEach(n => {
            if (!n.complianceRef) {
              complianceWarnings.push({ type: "compliance", severity: "warning", message: `SOC 2 CC7.2: Tool call '${n.label}' should have compliance mapping for audit trail.`, nodeId: n.id });
            }
          });
        }
      }
      const mergedVr: ValidationResults = {
        ...vr,
        passed: vr.passed && complianceErrors.length === 0,
        errors: [...(vr.errors || []), ...complianceErrors],
        warnings: [...(vr.warnings || []), ...complianceWarnings],
      };
      setLocalValidation(mergedVr);
      setRightPanel("validation");
      toast({ title: mergedVr.passed ? "Compilation passed" : "Compilation failed", description: `${mergedVr.errors?.length || 0} errors, ${mergedVr.warnings?.length || 0} warnings`, variant: mergedVr.passed ? "default" : "destructive" });
    },
    onError: (err: Error) => toast({ title: "Compile failed", description: err.message, variant: "destructive" }),
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/blueprints/${id}/sign`, { signedBy: signedBy || "system" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      setSignDialogOpen(false);
      setSignedBy("");
      toast({ title: "Blueprint signed and versioned" });
    },
    onError: (err: Error) => toast({ title: "Sign failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return (
    <div className="flex flex-col gap-4 p-6" data-testid="page-blueprint-detail-loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );

  if (!blueprint) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4" data-testid="page-blueprint-detail-empty">
      <GitBranch className="w-12 h-12 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">Blueprint not found</p>
      <Link href="/blueprints"><Button variant="outline" size="sm" data-testid="button-back"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button></Link>
    </div>
  );

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const currentStatus = blueprint.status;

  return (
    <div className="flex flex-col h-full" data-testid="page-blueprint-detail">
      <div className="flex items-center gap-3 p-3 border-b shrink-0 sticky top-0 z-50 bg-background flex-wrap">
        <Link href="/blueprints">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Input
          value={blueprintName}
          onChange={e => { setBlueprintName(e.target.value); setDirty(true); }}
          className="w-48 text-sm font-medium"
          data-testid="input-blueprint-name"
        />
        <StatusBadgeForBlueprint status={currentStatus} />
        <Badge variant="outline" className="text-xs" data-testid="badge-version">v{blueprint.version}</Badge>
        {linkedAgent && (
          <Badge variant="outline" className="text-xs" data-testid="badge-agent">{linkedAgent.name}</Badge>
        )}
        {ontologyReadiness && (
          <Badge
            variant="outline"
            className={`text-xs ${
              ontologyReadiness.ready
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : ontologyReadiness.overallScore >= 0.5
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
            }`}
            data-testid="badge-ontology-readiness"
          >
            <Shield className="w-3 h-3 mr-0.5" />
            Ontology {ontologyReadiness.ready ? "Ready" : `${Math.round(ontologyReadiness.overallScore * 100)}%`}
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={blueprint.isShared ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => shareMutation.mutate()}
              disabled={shareMutation.isPending}
              data-testid="button-toggle-share"
            >
              <Crown className="w-3 h-3" />
              {blueprint.isShared ? "Shared" : "Share"}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {blueprint.isShared ? "This blueprint is shared to the org. Click to unshare." : "Share this blueprint with the org."}
          </TooltipContent>
        </Tooltip>
        {blueprint.forkedFromId && (
          <Badge variant="outline" className="text-[10px]" data-testid="badge-forked">
            <Copy className="w-2.5 h-2.5 mr-0.5" /> Forked
          </Badge>
        )}
        {dirty && <span className="text-xs text-amber-500" data-testid="text-unsaved">Unsaved changes</span>}
        <div className="flex-1" />
        <div className="flex items-center rounded-md border overflow-hidden" data-testid="toggle-view-mode">
          <button
            type="button"
            onClick={() => setBusinessView(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${!businessView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            data-testid="button-technical-view"
          >
            <Code2 className="w-3 h-3" /> Technical
          </button>
          <button
            type="button"
            onClick={() => setBusinessView(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${businessView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            data-testid="button-business-view"
          >
            <Eye className="w-3 h-3" /> Business
          </button>
        </div>
        {!businessView && (
          <>
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save">
              <Save className="w-3.5 h-3.5 mr-1.5" /> {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => compileMutation.mutate()} disabled={compileMutation.isPending} data-testid="button-compile">
              <Play className="w-3.5 h-3.5 mr-1.5" /> {compileMutation.isPending ? "Compiling..." : "Compile"}
            </Button>
            <Button size="sm" onClick={() => setSignDialogOpen(true)} disabled={currentStatus !== "compiled"} data-testid="button-sign">
              <PenTool className="w-3.5 h-3.5 mr-1.5" /> Sign & Version
            </Button>
          </>
        )}
        {businessView && (
          <Button size="sm" variant="outline" data-testid="button-submit-it-review">
            <SendHorizonal className="w-3.5 h-3.5 mr-1.5" /> Submit for IT Review
          </Button>
        )}
      </div>
      {businessView && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b text-xs text-muted-foreground" data-testid="banner-business-view">
          <Eye className="w-3.5 h-3.5 text-primary shrink-0" />
          <span><strong className="text-foreground">Business View</strong> — showing plain-English step names. Switch to Technical view to edit nodes, compile, or sign.</span>
        </div>
      )}

      {linkedAgent?.agentType === "team" && (
        <div className="flex border-b shrink-0 bg-muted/30">
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium ${editorView === "single" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
            onClick={() => setEditorView("single")}
            data-testid="tab-single-blueprint"
          >
            <GitBranch className="w-3.5 h-3.5" /> Single-Agent Blueprint
          </button>
          <button
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium ${editorView === "team" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground"}`}
            onClick={() => setEditorView("team")}
            data-testid="tab-team-blueprint"
          >
            <Network className="w-3.5 h-3.5" /> Team Graph
          </button>
        </div>
      )}

      {editorView === "team" && linkedAgent?.agentType === "team" && (
        <TeamGraphEditor blueprintId={id!} teamAgentId={linkedAgent?.id} />
      )}

      {!(editorView === "team" && linkedAgent?.agentType === "team") && (
      <div className="flex flex-1 min-h-0">
        {!businessView && (
        <div className="w-[220px] border-r shrink-0 flex flex-col">
          <div className="p-3 border-b">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Node Palette</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-2 p-3">
              {NODE_TYPES.map(nt => {
                const Icon = nt.icon;
                return (
                  <div
                    key={nt.type}
                    className="flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer hover-elevate"
                    onClick={() => addNode(nt.type)}
                    data-testid={`palette-${nt.type}`}
                  >
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{nt.label}</span>
                    <Plus className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
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
              onClick={() => setEdgeMode(edgeMode ? null : "__waiting__")}
              data-testid="button-add-edge-mode"
            >
              <Link2 className="w-3.5 h-3.5 mr-1.5" /> {edgeMode ? "Cancel Edge Mode" : "Add Edge"}
            </Button>
          </div>
        </div>
        )}

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
                  <GitBranch className="w-10 h-10 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground" data-testid="text-empty-canvas">Add nodes from the palette to get started</p>
                </div>
              ) : (
                <>
                  <svg className="absolute" width="0" height="0">
                    <defs>
                      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="hsl(var(--muted-foreground))" />
                      </marker>
                    </defs>
                  </svg>
                  {nodes.map((node, idx) => {
                    const Icon = NODE_ICON_MAP[node.type] || GitBranch;
                    const isSelected = selectedNodeId === node.id;
                    const isInvalid = invalidNodeIds.has(node.id);
                    const isEdgeSource = edgeMode === node.id;
                    const incomingEdges = edges.filter(e => e.to === node.id);
                    const outgoingEdges = edges.filter(e => e.from === node.id);

                    return (
                      <div key={node.id} className="flex flex-col items-center w-full max-w-md">
                        {idx > 0 && incomingEdges.length === 0 && edges.some(e => e.from === nodes[idx - 1]?.id && e.to === node.id) === false && (
                          <div className="h-6" />
                        )}
                        {incomingEdges.map(edge => (
                          <div key={`edge-${edge.from}-${edge.to}`} className="flex flex-col items-center group">
                            <svg width="2" height="32" className="overflow-visible">
                              <line x1="1" y1="0" x2="1" y2="32" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                            </svg>
                            {!businessView && (
                            <button
                              className="invisible group-hover:visible -mt-5 mb-1 rounded-full bg-destructive text-destructive-foreground w-5 h-5 flex items-center justify-center text-xs"
                              onClick={(e) => { e.stopPropagation(); deleteEdge(edge.from, edge.to); }}
                              data-testid={`button-delete-edge-${edge.from}-${edge.to}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                            )}
                          </div>
                        ))}
                        {idx > 0 && incomingEdges.length === 0 && (
                          <div className="h-4" />
                        )}
                        <Card
                          className={`w-full ${businessView ? "cursor-default" : "cursor-pointer"} ${isSelected && !businessView ? "ring-2 ring-ring" : ""} ${isInvalid ? "ring-2 ring-destructive" : ""} ${isEdgeSource ? "ring-2 ring-blue-500" : ""}`}
                          onClick={() => {
                            if (businessView) return;
                            if (edgeMode === "__waiting__") {
                              setEdgeMode(node.id);
                            } else {
                              handleNodeClick(node.id);
                            }
                          }}
                          data-testid={`node-${node.id}`}
                        >
                          <CardContent className="p-3 flex items-center gap-2.5">
                            <div className={`w-1 h-6 rounded-full shrink-0 ${NODE_BG_COLORS[node.type] || "bg-gray-500"}`} />
                            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium flex-1 truncate" data-testid={`text-node-label-${node.id}`}>{getNodeDisplayLabel(node)}</span>
                            {!businessView && <Badge variant="outline" className="text-[10px] shrink-0">{node.type}</Badge>}
                            {node.complianceRef && (
                              <div className="flex items-center gap-1 shrink-0" data-testid={`compliance-badge-${node.id}`}>
                                <Shield className="w-3 h-3 text-emerald-500" />
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400">{node.complianceRef.regulation}</span>
                              </div>
                            )}
                            {isInvalid && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                            {!businessView && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0"
                              onClick={e => { e.stopPropagation(); deleteNode(node.id); }}
                              data-testid={`button-delete-node-${node.id}`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </Button>
                            )}
                          </CardContent>
                        </Card>
                        {outgoingEdges.length > 0 && idx < nodes.length - 1 && (
                          <div className="flex flex-col items-center">
                            {outgoingEdges.filter(e => nodes.findIndex(n => n.id === e.to) > idx).length === 0 && null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {businessView ? (
          <div className="w-[280px] border-l shrink-0 flex flex-col" data-testid="panel-business-review">
            <div className="p-3 border-b">
              <span className="text-xs font-semibold">Review Summary</span>
            </div>
            <div className="p-4 flex flex-col gap-3 text-xs text-muted-foreground">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-foreground">{nodes.length} Steps</span>
                <p>Review each step name below. When satisfied, click <strong>Submit for IT Review</strong> in the header.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                {nodes.map((n, i) => (
                  <div key={n.id} className="flex items-center gap-2" data-testid={`review-step-${n.id}`}>
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-semibold shrink-0">{i + 1}</span>
                    <span className="text-foreground truncate">{getNodeDisplayLabel(n)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/70 mt-2">Switch to Technical view to edit individual steps or add connections.</p>
            </div>
          </div>
        ) : (
        <div className="w-[280px] border-l shrink-0 flex flex-col">
          <div className="flex border-b">
            <button
              className={`flex-1 p-2 text-xs font-medium text-center ${rightPanel === "properties" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
              onClick={() => setRightPanel("properties")}
              data-testid="tab-properties"
            >
              Properties
            </button>
            <button
              className={`flex-1 p-2 text-xs font-medium text-center ${rightPanel === "validation" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
              onClick={() => setRightPanel("validation")}
              data-testid="tab-validation"
            >
              Validation {localValidation?.errors?.length ? `(${localValidation.errors.length})` : ""}
            </button>
            <button
              className={`flex-1 p-2 text-xs font-medium text-center ${rightPanel === "changes" ? "border-b-2 border-primary" : "text-muted-foreground"}`}
              onClick={() => setRightPanel("changes")}
              data-testid="tab-changes"
            >
              Changes {dirty ? "*" : ""}
            </button>
          </div>

          <ScrollArea className="flex-1">
            {rightPanel === "properties" ? (
              <div className="p-4 flex flex-col gap-4">
                {selectedNode ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Label</label>
                      <Input
                        value={selectedNode.label}
                        onChange={e => updateNode(selectedNode.id, { label: e.target.value })}
                        data-testid="input-node-label"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <Badge variant="outline" className="w-fit" data-testid="badge-node-type">{selectedNode.type}</Badge>
                    </div>
                    {selectedNode.type === "tool_call" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">MCP Tool</label>
                          {(() => {
                            const depServerIds = mcpDependencies.map(d => d.serverId);
                            const availableTools = (mcpTools || []).filter(t => t.enabled && (depServerIds.length === 0 || depServerIds.includes(t.serverId)));
                            return (
                              <div className="flex flex-col gap-1">
                                <select
                                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                                  value={selectedNode.mcpToolId || ""}
                                  onChange={e => {
                                    const tool = availableTools.find(t => t.id === e.target.value);
                                    updateNode(selectedNode.id, {
                                      mcpToolId: e.target.value || undefined,
                                      toolName: tool?.name || selectedNode.toolName || "",
                                      mcpToolServerId: tool?.serverId,
                                    });
                                  }}
                                  data-testid="select-mcp-tool"
                                >
                                  <option value="">Manual entry</option>
                                  {availableTools.map(t => {
                                    const srv = mcpServers?.find(s => s.id === t.serverId);
                                    return (
                                      <option key={t.id} value={t.id}>
                                        {t.name} ({srv?.name || "unknown"})
                                      </option>
                                    );
                                  })}
                                </select>
                                {!selectedNode.mcpToolId && (
                                  <Input
                                    value={selectedNode.toolName || ""}
                                    onChange={e => updateNode(selectedNode.id, { toolName: e.target.value })}
                                    placeholder="e.g. searchAPI"
                                    data-testid="input-tool-name"
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {selectedNode.mcpToolId && (() => {
                          const tool = (mcpTools || []).find(t => t.id === selectedNode.mcpToolId);
                          if (!tool) return null;
                          return (
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] text-muted-foreground">{tool.description || "No description"}</span>
                              {tool.riskClassification && (
                                <Badge variant="outline" className="text-[9px] w-fit">{tool.riskClassification} risk</Badge>
                              )}
                              {tool.inputSchema && (
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[10px] font-medium text-muted-foreground">Input Schema</label>
                                  <pre className="text-[9px] bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(tool.inputSchema, null, 2)}</pre>
                                </div>
                              )}
                              {tool.outputSchema && (
                                <div className="flex flex-col gap-0.5">
                                  <label className="text-[10px] font-medium text-muted-foreground">Output Schema</label>
                                  <pre className="text-[9px] bg-muted/50 rounded p-1.5 overflow-x-auto max-h-24 overflow-y-auto">{JSON.stringify(tool.outputSchema, null, 2)}</pre>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Permissions (comma-separated)</label>
                          <Input
                            value={(selectedNode.permissions || []).join(", ")}
                            onChange={e => updateNode(selectedNode.id, { permissions: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })}
                            placeholder="read, write"
                            data-testid="input-permissions"
                          />
                        </div>
                      </>
                    )}
                    {selectedNode.type === "llm_call" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Model</label>
                          <Input
                            value={selectedNode.model || ""}
                            onChange={e => updateNode(selectedNode.id, { model: e.target.value })}
                            placeholder="e.g. gpt-4.1"
                            data-testid="input-model"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Temperature</label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            value={selectedNode.temperature ?? ""}
                            onChange={e => updateNode(selectedNode.id, { temperature: parseFloat(e.target.value) || 0 })}
                            placeholder="0.7"
                            data-testid="input-temperature"
                          />
                        </div>
                      </>
                    )}
                    {selectedNode.type === "rag" && (
                      <>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Vector Store</label>
                          <Input
                            value={selectedNode.vectorStore || ""}
                            onChange={e => updateNode(selectedNode.id, { vectorStore: e.target.value })}
                            placeholder="e.g. pinecone-main"
                            data-testid="input-vector-store"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Top K</label>
                          <Input
                            type="number"
                            min="1"
                            value={selectedNode.topK ?? ""}
                            onChange={e => updateNode(selectedNode.id, { topK: parseInt(e.target.value) || 5 })}
                            placeholder="5"
                            data-testid="input-top-k"
                          />
                        </div>
                      </>
                    )}
                    <div className="border-t pt-3 flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5" /> Compliance Mapping
                      </label>
                      <select
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                        value={selectedNode.complianceRef?.regulation || ""}
                        onChange={e => {
                          const reg = e.target.value;
                          if (!reg) {
                            updateNode(selectedNode.id, { complianceRef: undefined });
                          } else {
                            updateNode(selectedNode.id, { complianceRef: { ...(selectedNode.complianceRef || {}), regulation: reg } });
                          }
                        }}
                        data-testid="select-compliance-regulation"
                      >
                        <option value="">None</option>
                        {["HIPAA", "SOC 2", "EU AI Act", "GDPR", "PCI-DSS", "DOT", "IATA", "SOX", "FCRA", "ECOA", "TILA"].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      {selectedNode.complianceRef?.regulation && (
                        <>
                          <Input
                            value={selectedNode.complianceRef?.section || ""}
                            onChange={e => updateNode(selectedNode.id, { complianceRef: { ...selectedNode.complianceRef, section: e.target.value } })}
                            placeholder="e.g. \u00A7164.502(b)"
                            data-testid="input-compliance-section"
                          />
                          <Input
                            value={selectedNode.complianceRef?.note || ""}
                            onChange={e => updateNode(selectedNode.id, { complianceRef: { ...selectedNode.complianceRef, note: e.target.value } })}
                            placeholder="Compliance note"
                            data-testid="input-compliance-note"
                          />
                        </>
                      )}
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => deleteNode(selectedNode.id)} data-testid="button-delete-selected-node">
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Node
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col gap-4" data-testid="panel-blueprint-settings">
                    <p className="text-xs text-muted-foreground">Blueprint Settings</p>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Pattern Type</label>
                      <Select
                        value={blueprint.patternType || "none"}
                        onValueChange={(v) => {
                          const val = v === "none" ? null : v;
                          apiRequest("PATCH", `/api/blueprints/${id}`, { patternType: val }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
                            queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
                            toast({ title: "Pattern type updated" });
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid="select-pattern-type">
                          <SelectValue placeholder="Select pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No pattern</SelectItem>
                          <SelectItem value="rag_pipeline">RAG Pipeline</SelectItem>
                          <SelectItem value="orchestrator">Orchestrator</SelectItem>
                          <SelectItem value="fan_out">Fan-out</SelectItem>
                          <SelectItem value="linear_chain">Linear Chain</SelectItem>
                          <SelectItem value="human_in_loop">Human-in-Loop</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Tags</label>
                      <Input
                        placeholder="comma-separated tags"
                        defaultValue={(blueprint.tags as string[] || []).join(", ")}
                        onBlur={(e) => {
                          const tags = e.target.value.split(",").map(t => t.trim()).filter(Boolean);
                          apiRequest("PATCH", `/api/blueprints/${id}`, { tags }).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["/api/blueprints", id] });
                            queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
                            toast({ title: "Tags updated" });
                          });
                        }}
                        data-testid="input-tags"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-4 border-t pt-4">Select a node above to edit its properties</p>
                  </div>
                )}
              </div>
            ) : rightPanel === "validation" ? (
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {localValidation?.passed ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium" data-testid="text-validation-status">
                    {localValidation?.passed ? "Validation Passed" : localValidation ? "Validation Failed" : "Not compiled yet"}
                  </span>
                </div>
                {(localValidation?.errors || []).map((item, i) => (
                  <div
                    key={`err-${i}`}
                    className={`flex items-start gap-2 p-2.5 rounded-md bg-destructive/10 text-sm ${item.nodeId ? "cursor-pointer" : ""}`}
                    onClick={() => { if (item.nodeId) { setSelectedNodeId(item.nodeId); setRightPanel("properties"); } }}
                    data-testid={`validation-error-${i}`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <Badge variant="outline" className={`text-[10px] w-fit ${item.type === "compliance" ? "text-purple-600 dark:text-purple-400 border-purple-500/30" : item.type === "policyCompatibility" ? "text-orange-600 dark:text-orange-400 border-orange-500/30" : "text-destructive border-destructive/30"}`}>{item.type === "policyCompatibility" ? "policy compatibility" : item.type}</Badge>
                      <span className="text-xs">{item.message}</span>
                    </div>
                  </div>
                ))}
                {(localValidation?.warnings || []).map((item, i) => (
                  <div
                    key={`warn-${i}`}
                    className={`flex items-start gap-2 p-2.5 rounded-md ${item.type === "policyCompatibility" ? "bg-orange-500/10" : "bg-amber-500/10"} text-sm ${item.nodeId ? "cursor-pointer" : ""}`}
                    onClick={() => { if (item.nodeId) { setSelectedNodeId(item.nodeId); setRightPanel("properties"); } }}
                    data-testid={`validation-warning-${i}`}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 ${item.type === "policyCompatibility" ? "text-orange-500" : "text-amber-500"} shrink-0 mt-0.5`} />
                    <div className="flex flex-col gap-1 min-w-0">
                      <Badge variant="outline" className={`text-[10px] w-fit ${item.type === "compliance" ? "text-purple-600 dark:text-purple-400 border-purple-500/30" : item.type === "policyCompatibility" ? "text-orange-600 dark:text-orange-400 border-orange-500/30" : "text-amber-600 dark:text-amber-400 border-amber-500/30"}`}>{item.type === "policyCompatibility" ? "policy compatibility" : item.type}</Badge>
                      <span className="text-xs">{item.message}</span>
                    </div>
                  </div>
                ))}
                {(localValidation?.errors?.length === 0 && localValidation?.warnings?.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-4">No issues found</p>
                )}
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-3" data-testid="panel-changes">
                <div className="flex items-center gap-2 flex-wrap">
                  <Diff className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Diff Review</span>
                  {dirty && <Badge variant="outline" className="text-[10px]">Unsaved</Badge>}
                </div>
                {(() => {
                  const savedIds = new Set(savedSnapshot.map(n => n.id));
                  const currentIds = new Set(nodes.map(n => n.id));
                  const addedNodes = nodes.filter(n => !savedIds.has(n.id));
                  const removedNodes = savedSnapshot.filter(n => !currentIds.has(n.id));
                  const modifiedNodes = nodes.filter(n => {
                    if (!savedIds.has(n.id)) return false;
                    const saved = savedSnapshot.find(s => s.id === n.id);
                    if (!saved) return false;
                    return JSON.stringify(saved) !== JSON.stringify(n);
                  });
                  const hasChanges = addedNodes.length > 0 || removedNodes.length > 0 || modifiedNodes.length > 0;

                  if (!hasChanges) {
                    return <p className="text-xs text-muted-foreground text-center py-6" data-testid="text-no-changes">No changes from saved version</p>;
                  }

                  return (
                    <div className="flex flex-col gap-2">
                      {addedNodes.map(n => (
                        <div key={`add-${n.id}`} className="flex flex-col gap-1 p-2.5 rounded-md bg-emerald-500/10" data-testid={`change-added-${n.id}`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">Added</Badge>
                            <span className="text-xs font-medium">{n.label}</span>
                            <Badge variant="outline" className="text-[9px]">{n.type}</Badge>
                          </div>
                          {n.complianceRef && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400" data-testid={`change-impact-added-${n.id}`}>
                              Adding '{n.label}' satisfies {n.complianceRef.regulation} {n.complianceRef.section || ""}
                            </span>
                          )}
                          {n.type === "tool_call" && (
                            <span className="text-[10px] text-muted-foreground" data-testid={`change-note-tool-${n.id}`}>
                              Note: Adding tool '{n.label}' may require BAA with tool provider if HIPAA-scoped
                            </span>
                          )}
                        </div>
                      ))}
                      {removedNodes.map(n => (
                        <div key={`rem-${n.id}`} className="flex flex-col gap-1 p-2.5 rounded-md bg-destructive/10" data-testid={`change-removed-${n.id}`}>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">Removed</Badge>
                            <span className="text-xs font-medium">{n.label}</span>
                            <Badge variant="outline" className="text-[9px]">{n.type}</Badge>
                          </div>
                          {n.complianceRef && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400" data-testid={`change-impact-removed-${n.id}`}>
                              Removing '{n.label}' reduces {n.complianceRef.regulation} {n.complianceRef.section || ""} coverage
                            </span>
                          )}
                        </div>
                      ))}
                      {modifiedNodes.map(n => {
                        const saved = savedSnapshot.find(s => s.id === n.id);
                        return (
                          <div key={`mod-${n.id}`} className="flex flex-col gap-1 p-2.5 rounded-md bg-blue-500/10" data-testid={`change-modified-${n.id}`}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/30">Modified</Badge>
                              <span className="text-xs font-medium">{n.label}</span>
                              <Badge variant="outline" className="text-[9px]">{n.type}</Badge>
                            </div>
                            {n.complianceRef && !saved?.complianceRef && (
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                Adding compliance mapping: {n.complianceRef.regulation} {n.complianceRef.section || ""}
                              </span>
                            )}
                            {!n.complianceRef && saved?.complianceRef && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400">
                                Removed compliance mapping: {saved.complianceRef.regulation} {saved.complianceRef.section || ""}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {versionHistory.length > 0 && (
              <div className="border-t mx-4">
                <button
                  className="flex items-center gap-2 py-3 w-full text-left"
                  onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                  data-testid="button-toggle-version-history"
                >
                  {versionHistoryOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span className="text-xs font-medium text-muted-foreground">Version History ({versionHistory.length})</span>
                </button>
                {versionHistoryOpen && (
                  <div className="flex flex-col gap-2 pb-4">
                    {versionHistory.slice().reverse().map((entry: any, i: number) => (
                      <div key={i} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50" data-testid={`version-entry-${entry.version}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">v{entry.version}</Badge>
                          <span className="text-xs text-muted-foreground">{entry.signedBy}</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {entry.signedAt ? new Date(entry.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="border-t mx-4">
              <button
                className="flex items-center gap-2 py-3 w-full text-left"
                onClick={() => setDepsOpen(!depsOpen)}
                data-testid="button-toggle-mcp-deps"
              >
                {depsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">MCP Dependencies ({mcpDependencies.length})</span>
              </button>
              {depsOpen && (
                <div className="flex flex-col gap-2 pb-4">
                  {mcpServers && mcpServers.length > 0 ? (
                    <>
                      {mcpServers
                        .filter(s => s.status === "active" || s.status === "registered")
                        .map(s => {
                          const dep = mcpDependencies.find(d => d.serverId === s.id);
                          const isDep = !!dep;
                          return (
                            <div
                              key={s.id}
                              className={`flex items-start gap-2 p-2 rounded-md cursor-pointer ${isDep ? "bg-primary/10 border border-primary/20" : "bg-muted/50 hover-elevate"}`}
                              onClick={() => {
                                if (isDep) {
                                  setMcpDependencies(prev => prev.filter(d => d.serverId !== s.id));
                                } else {
                                  setMcpDependencies(prev => [...prev, { serverId: s.id, pinnedVersion: s.expectedProtocolVersion || "2025-03-26" }]);
                                }
                                setDirty(true);
                              }}
                              data-testid={`mcp-dep-${s.id}`}
                            >
                              <Server className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                <span className="text-xs font-medium truncate">{s.name}</span>
                                <span className="text-[10px] text-muted-foreground truncate">{s.description || "No description"}</span>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <Badge variant="outline" className="text-[9px]">{s.riskTier}</Badge>
                                  <Badge variant="outline" className="text-[9px]">{s.status}</Badge>
                                </div>
                              </div>
                              {isDep && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                            </div>
                          );
                        })}
                      {mcpDependencies.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1">
                          <span className="text-[10px] font-medium text-muted-foreground px-1">Pinned Versions</span>
                          {mcpDependencies.map(dep => {
                            const srv = mcpServers?.find(s => s.id === dep.serverId);
                            return (
                              <div key={dep.serverId} className="flex items-center gap-1.5 px-1">
                                <span className="text-[10px] text-muted-foreground truncate flex-1">{srv?.name || dep.serverId}</span>
                                <Input
                                  className="h-5 text-[10px] px-1.5 w-24"
                                  value={dep.pinnedVersion}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => {
                                    setMcpDependencies(prev => prev.map(d => d.serverId === dep.serverId ? { ...d, pinnedVersion: e.target.value } : d));
                                    setDirty(true);
                                  }}
                                  data-testid={`input-pinned-version-${dep.serverId}`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-mcp-servers">No MCP servers available</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t mx-4">
              <button
                className="flex items-center gap-2 py-3 w-full text-left"
                onClick={() => setContextSourcesOpen(!contextSourcesOpen)}
                data-testid="button-toggle-context-sources"
              >
                {contextSourcesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Context Sources ({attachedResourceIds.size})</span>
              </button>
              {contextSourcesOpen && (
                <div className="flex flex-col gap-2 pb-4">
                  {mcpResources && mcpResources.length > 0 ? (
                    <>
                      {mcpResources
                        .filter(r => r.approvalStatus === "approved" || r.approvalStatus === "auto_approved")
                        .map(r => {
                          const attached = attachedResourceIds.has(r.id);
                          return (
                            <div key={r.id} className="flex flex-col">
                              <div
                                className={`flex items-start gap-2 p-2 rounded-md cursor-pointer ${attached ? "bg-primary/10 border border-primary/20" : "bg-muted/50 hover-elevate"}`}
                                onClick={() => {
                                  setAttachedResourceIds(prev => {
                                    const next = new Set(prev);
                                    if (next.has(r.id)) {
                                      next.delete(r.id);
                                      setContextPlan(prev => prev.filter(cp => cp.resourceId !== r.id));
                                    } else {
                                      next.add(r.id);
                                      setContextPlan(prev => {
                                        if (!prev.find(cp => cp.resourceId === r.id)) {
                                          return [...prev, { resourceId: r.id, retrievalStrategy: "eager" as const }];
                                        }
                                        return prev;
                                      });
                                    }
                                    return next;
                                  });
                                  setDirty(true);
                                }}
                                data-testid={`context-source-${r.id}`}
                              >
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <span className="text-xs font-medium truncate">{r.name}</span>
                                  <span className="text-[10px] text-muted-foreground truncate">{r.uri}</span>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Badge variant="outline" className="text-[9px]">{r.sensitivityLevel}</Badge>
                                    {r.mimeType && <Badge variant="outline" className="text-[9px]">{r.mimeType.split("/").pop()}</Badge>}
                                  </div>
                                </div>
                                {attached && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                              </div>
                              {attached && (
                                <div className="ml-5 flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-muted-foreground">Strategy:</span>
                                  {(["eager", "lazy", "on-demand"] as const).map(strat => {
                                    const plan = contextPlan.find(cp => cp.resourceId === r.id);
                                    const isActive = plan?.retrievalStrategy === strat;
                                    return (
                                      <button
                                        key={strat}
                                        className={`text-[9px] px-1.5 py-0.5 rounded ${isActive ? "bg-primary/20 text-primary font-medium" : "bg-muted text-muted-foreground"}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setContextPlan(prev => {
                                            const existing = prev.filter(cp => cp.resourceId !== r.id);
                                            return [...existing, { resourceId: r.id, retrievalStrategy: strat }];
                                          });
                                          setDirty(true);
                                        }}
                                        data-testid={`strategy-${r.id}-${strat}`}
                                      >
                                        {strat}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      {mcpResources.filter(r => r.approvalStatus === "pending" || r.approvalStatus === "denied").length > 0 && (
                        <p className="text-[10px] text-muted-foreground px-1">
                          {mcpResources.filter(r => r.approvalStatus === "pending" || r.approvalStatus === "denied").length} resource(s) pending or denied approval
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-context-sources">No MCP resources available</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t mx-4">
              <button
                className="flex items-center gap-2 py-3 w-full text-left"
                onClick={() => setKgBindingsOpen(!kgBindingsOpen)}
                data-testid="button-toggle-kg-bindings"
              >
                {kgBindingsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Globe2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Knowledge Graph Scope ({kgBindings.length})</span>
              </button>
              {kgBindingsOpen && (
                <div className="flex flex-col gap-2 pb-4">
                  {(() => {
                    const KG_DOMAINS = [
                      "Financial Services - Lending",
                      "Financial Services - Trading",
                      "Healthcare - Clinical",
                      "Healthcare - Administrative",
                      "Travel & Transportation",
                      "Insurance - Claims",
                      "Insurance - Underwriting",
                      "Manufacturing - Quality",
                      "Retail - Commerce",
                      "Custom Domain...",
                    ];
                    const ontologyTags = (linkedAgent?.ontologyTags as any) || {};
                    const suggestedDomain = ontologyTags?.domain as string | undefined;
                    return (
                      <>
                        {KG_DOMAINS.map(domain => {
                          const isChecked = kgBindings.includes(domain);
                          const isSuggested = suggestedDomain && domain.toLowerCase().includes(suggestedDomain.toLowerCase());
                          return (
                            <div
                              key={domain}
                              className="flex items-center gap-2 px-1"
                              data-testid={`kg-domain-${domain.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setKgBindings(prev => [...prev, domain]);
                                  } else {
                                    setKgBindings(prev => prev.filter(d => d !== domain));
                                  }
                                  setDirty(true);
                                }}
                                data-testid={`checkbox-kg-${domain.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
                              />
                              <span className="text-xs flex-1">{domain}</span>
                              {isSuggested && (
                                <Badge variant="outline" className="text-[9px]">suggested</Badge>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-1.5 px-1 mt-1">
                          <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-[10px] text-muted-foreground" data-testid="text-kg-scope-note">
                            Runtime will enforce that this agent only accesses knowledge graph nodes within declared scope.
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="border-t mx-4">
              <button
                className="flex items-center gap-2 py-3 w-full text-left"
                onClick={() => setOntologyReadinessOpen(!ontologyReadinessOpen)}
                data-testid="button-toggle-ontology-readiness"
              >
                {ontologyReadinessOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Ontology Readiness {ontologyReadiness ? `(${Math.round(ontologyReadiness.overallScore * 100)}%)` : ""}
                </span>
                {ontologyReadiness && (
                  ontologyReadiness.ready
                    ? <CheckCircle className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
                    : <AlertTriangle className="w-3 h-3 text-amber-500 ml-auto shrink-0" />
                )}
              </button>
              {ontologyReadinessOpen && (
                <div className="flex flex-col gap-2 pb-4" data-testid="panel-ontology-readiness">
                  {ontologyReadinessLoading ? (
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : ontologyReadiness ? (
                    <>
                      <div className="flex items-center gap-2 px-1 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">Overall Score:</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            ontologyReadiness.overallScore >= 0.8
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : ontologyReadiness.overallScore >= 0.5
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                : "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20"
                          }`}
                          data-testid="badge-ontology-overall-score"
                        >
                          {Math.round(ontologyReadiness.overallScore * 100)}%
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${ontologyReadiness.ready ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20"}`}
                          data-testid="badge-ontology-ready-status"
                        >
                          {ontologyReadiness.ready ? "Ready" : "Not Ready"}
                        </Badge>
                      </div>

                      {ontologyReadiness.tools.length > 0 && (
                        <div className="flex flex-col gap-1.5 px-1">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tool Alignment</span>
                          {ontologyReadiness.tools.map((tool, i) => (
                            <div
                              key={`${tool.serverId}-${tool.toolName}-${i}`}
                              className="flex flex-col gap-1 p-2 rounded-md bg-muted/50"
                              data-testid={`ontology-tool-${tool.toolName}`}
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Wrench className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="text-xs font-medium truncate flex-1">{tool.toolName}</span>
                                {tool.alignmentScore >= 0.8 ? (
                                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                ) : tool.alignmentScore >= 0.5 ? (
                                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                ) : (
                                  <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                )}
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] ${
                                    tool.alignmentScore >= 0.8
                                      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                      : tool.alignmentScore >= 0.5
                                        ? "text-amber-600 dark:text-amber-400 border-amber-500/20"
                                        : "text-red-600 dark:text-red-400 border-red-500/20"
                                  }`}
                                  data-testid={`badge-tool-score-${tool.toolName}`}
                                >
                                  {Math.round(tool.alignmentScore * 100)}%
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{tool.serverName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {tool.matchedParams}/{tool.totalParams} params matched
                              </span>
                              {tool.unmatchedParams.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {tool.unmatchedParams.map(p => (
                                    <Badge key={p} variant="outline" className="text-[9px] font-mono text-muted-foreground" data-testid={`badge-unmatched-param-${p}`}>
                                      {p}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {ontologyReadiness.warnings.length > 0 && (
                        <div className="flex flex-col gap-1 px-1">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Warnings</span>
                          {ontologyReadiness.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1.5" data-testid={`ontology-warning-${i}`}>
                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                              <span className="text-[10px] text-muted-foreground">{w}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {ontologyReadiness.tools.length === 0 && ontologyReadiness.warnings.length === 0 && (
                        <p className="text-[10px] text-muted-foreground px-1" data-testid="text-no-ontology-tools">No tool nodes to evaluate</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[10px] text-muted-foreground px-1">Could not load ontology readiness</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t mx-4">
              <button
                className="flex items-center gap-2 py-3 w-full text-left"
                onClick={() => setPromptNodesOpen(!promptNodesOpen)}
                data-testid="button-toggle-prompt-nodes"
              >
                {promptNodesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Prompt Nodes ({promptBindings.length})</span>
              </button>
              {promptNodesOpen && (
                <div className="flex flex-col gap-2 pb-4">
                  {mcpPrompts && mcpPrompts.filter(p => p.publishedStatus === "published").length > 0 ? (
                    <>
                      {mcpPrompts
                        .filter(p => p.publishedStatus === "published")
                        .map(p => {
                          const binding = promptBindings.find(b => b.promptId === p.id);
                          const isBound = !!binding;
                          return (
                            <div key={p.id} className="flex flex-col gap-1.5">
                              <div
                                className={`flex items-start gap-2 p-2 rounded-md cursor-pointer ${isBound ? "bg-primary/10 border border-primary/20" : "bg-muted/50 hover-elevate"}`}
                                onClick={() => {
                                  if (isBound) {
                                    setPromptBindings(prev => prev.filter(b => b.promptId !== p.id));
                                  } else {
                                    setPromptBindings(prev => [...prev, { promptId: p.id, argumentMappings: {} }]);
                                  }
                                  setDirty(true);
                                }}
                                data-testid={`prompt-node-${p.id}`}
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                  <span className="text-xs font-medium truncate">{p.name}</span>
                                  <span className="text-[10px] text-muted-foreground truncate">{p.description || "No description"}</span>
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Badge variant="outline" className="text-[9px]">{p.serverName}</Badge>
                                    {p.arguments && <Badge variant="outline" className="text-[9px]">{p.arguments.length} args</Badge>}
                                  </div>
                                </div>
                                {isBound && <CheckCircle className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />}
                              </div>
                              {isBound && p.arguments && p.arguments.length > 0 && (
                                <div className="ml-5 flex flex-col gap-1 pb-1">
                                  {p.arguments.map(arg => (
                                    <div key={arg.name} className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted-foreground w-16 shrink-0 truncate" title={arg.name}>{arg.name}{arg.required ? "*" : ""}</span>
                                      <Input
                                        className="h-6 text-[10px] px-1.5"
                                        placeholder={`Map to variable...`}
                                        value={binding?.argumentMappings[arg.name] || ""}
                                        onClick={e => e.stopPropagation()}
                                        onChange={e => {
                                          const val = e.target.value;
                                          setPromptBindings(prev =>
                                            prev.map(b =>
                                              b.promptId === p.id
                                                ? { ...b, argumentMappings: { ...b.argumentMappings, [arg.name]: val } }
                                                : b
                                            )
                                          );
                                          setDirty(true);
                                        }}
                                        data-testid={`input-arg-mapping-${p.id}-${arg.name}`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-prompt-nodes">No published prompts available</p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        )}
      </div>
      )}

      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-sign-dialog-title">Sign & Version Blueprint</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will create version {(blueprint.version || 0) + 1} of "{blueprintName}". This action cannot be undone.
          </p>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Signed By</label>
            <Input
              value={signedBy}
              onChange={e => setSignedBy(e.target.value)}
              placeholder="Your name or identifier"
              data-testid="input-signed-by"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)} data-testid="button-cancel-sign">Cancel</Button>
            <Button onClick={() => signMutation.mutate()} disabled={signMutation.isPending} data-testid="button-confirm-sign">
              {signMutation.isPending ? "Signing..." : "Sign & Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
