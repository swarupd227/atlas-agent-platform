import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import type { AgentTemplate } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ArrowRight,
  Plus,
  X,
  Save,
  Sparkles,
  Shield,
  Layers,
  Wrench,
  GitBranch,
  Lock,
  Brain,
  ScrollText,
  FlaskConical,
  RotateCcw,
  Tag,
  Headphones,
  FileText,
  TrendingUp,
  BookOpen,
  Scale,
  Bot,
  AlertTriangle,
  Activity,
  BarChart3,
  Briefcase,
  Calculator,
  Camera,
  CheckCircle,
  ClipboardList,
  Clock,
  Cloud,
  Code,
  Cog,
  CreditCard,
  Database,
  Eye,
  Factory,
  Film,
  FolderSearch,
  GraduationCap,
  Heart,
  HelpCircle,
  Image,
  LineChart,
  List,
  Mail,
  Map,
  MessageSquare,
  Microscope,
  Monitor,
  Package,
  Pill,
  Receipt,
  RefreshCw,
  Rocket,
  Route,
  ScanLine,
  Server,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Target,
  TestTube,
  ThumbsUp,
  Truck,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ToolConfig = { name: string; description: string; permissions?: string[] };
type WorkflowNode = { id: string; type: string; label: string };
type PermissionsConfig = { dataAccess?: string[]; apiAccess?: string[]; writeAccess?: string[] };
type MemoryRagConfig = { vectorStore: string; retrievalStrategy: string; chunkSize: number; embeddingModel: string; topK: number } | null;
type PolicyBinding = { policyName: string; enforcement: string };
type EvalBinding = { suiteName: string; schedule: string };
type RollbackPlan = { triggerConditions: string[]; rollbackTargetVersion: string } | null;

const iconMap: Record<string, LucideIcon> = {
  headphones: Headphones,
  "file-text": FileText,
  "trending-up": TrendingUp,
  shield: Shield,
  "book-open": BookOpen,
  scale: Scale,
  bot: Bot,
  "alert-triangle": AlertTriangle,
  activity: Activity,
  "bar-chart": BarChart3,
  brain: Brain,
  briefcase: Briefcase,
  calculator: Calculator,
  camera: Camera,
  "check-circle": CheckCircle,
  "clipboard-list": ClipboardList,
  clock: Clock,
  cloud: Cloud,
  code: Code,
  cog: Cog,
  "credit-card": CreditCard,
  database: Database,
  eye: Eye,
  factory: Factory,
  film: Film,
  flask: FlaskConical,
  "folder-search": FolderSearch,
  "graduation-cap": GraduationCap,
  heart: Heart,
  "help-circle": HelpCircle,
  image: Image,
  "line-chart": LineChart,
  list: List,
  lock: Lock,
  mail: Mail,
  map: Map,
  "message-square": MessageSquare,
  microscope: Microscope,
  monitor: Monitor,
  package: Package,
  pill: Pill,
  receipt: Receipt,
  "refresh-cw": RefreshCw,
  rocket: Rocket,
  route: Route,
  "scan-line": ScanLine,
  "scroll-text": ScrollText,
  server: Server,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  stethoscope: Stethoscope,
  tag: Tag,
  target: Target,
  "test-tube": TestTube,
  "thumbs-up": ThumbsUp,
  truck: Truck,
  "user-check": UserCheck,
  users: Users,
  wrench: Wrench,
  zap: Zap,
};

const categoryLabels: Record<string, string> = {
  support: "Customer Support",
  data_processing: "Data Processing",
  sales: "Sales & Marketing",
  trust_safety: "Trust & Safety",
  knowledge_management: "Knowledge Management",
  governance: "Governance & Compliance",
  operations: "Operations",
  analytics: "Analytics & Insights",
  clinical: "Clinical & Care",
  research: "Research & Development",
  engineering: "Engineering",
  creative: "Creative & Content",
  risk: "Risk & Compliance",
  supply_chain: "Supply Chain",
  quality: "Quality Assurance",
  general: "General",
};

const industryLabels: Record<string, string> = {
  cross_industry: "Cross-Industry",
  technology: "Technology",
  financial_services: "Financial Services",
  healthcare: "Healthcare",
  manufacturing: "Manufacturing",
  retail: "Retail & E-Commerce",
  education: "Education",
  pharma: "Pharmaceuticals",
  media_entertainment: "Media & Entertainment",
};

const allCategories = [
  "support", "data_processing", "sales", "trust_safety", "knowledge_management",
  "governance", "operations", "analytics", "clinical", "research", "engineering",
  "creative", "risk", "supply_chain", "quality", "general",
];

const allIndustries = [
  "cross_industry", "technology", "financial_services", "healthcare",
  "manufacturing", "retail", "education", "pharma", "media_entertainment",
];

const complexityOptions = ["low", "medium", "high"];
const riskTierOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const autonomyOptions = ["autonomous", "assisted", "supervised", "manual"];
const enforcementOptions = ["hard", "soft", "advisory"];
const scheduleOptions = ["on_deploy", "daily", "weekly", "on_change", "manual"];

export default function TemplateDetail() {
  const [, params] = useRoute("/templates/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const templateId = params?.id;
  const isNew = templateId === "new";

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const startInEditMode = searchParams.get("edit") === "true";

  const [editing, setEditing] = useState(isNew || startInEditMode);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, any>>(isNew ? {
    name: "",
    description: "",
    category: "general",
    industry: "cross_industry",
    icon: "bot",
    complexity: "medium",
    modelProvider: "openai",
    modelName: "gpt-4.1",
    defaultRiskTier: "MEDIUM",
    defaultAutonomyMode: "assisted",
    tools: [{ name: "", description: "", permissions: [] }],
    workflowNodes: [{ id: "step_1", type: "llm_call", label: "" }],
    dataAccess: "",
    apiAccess: "",
    writeAccess: "",
    vectorStore: "",
    retrievalStrategy: "",
    chunkSize: "",
    embeddingModel: "",
    topK: "",
    tags: [] as string[],
    policyBindings: [] as PolicyBinding[],
    evalBindings: [] as EvalBinding[],
    triggerConditions: [""],
    rollbackTargetVersion: "previous_stable",
  } : {});

  const { data: template, isLoading } = useQuery<AgentTemplate>({
    queryKey: ["/api/agent-templates", templateId],
    enabled: !!templateId && !isNew,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/agent-templates", data);
      return res.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates"] });
      setEditing(false);
      toast({ title: "Template created successfully" });
      navigate(`/templates/${created.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create template", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PUT", `/api/agent-templates/${templateId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates", templateId] });
      setEditing(false);
      toast({ title: "Template updated successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update template", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/agent-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-templates"] });
      toast({ title: "Template deleted successfully" });
      navigate("/templates");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete template", description: err.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (!template) return;
    const tools = Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [];
    const workflow = template.blueprintJson as { nodes?: WorkflowNode[] } | null;
    const permissions = template.permissionsConfig as PermissionsConfig | null;
    const memory = template.memoryRagConfig as MemoryRagConfig;
    const policies = Array.isArray(template.policyBindings) ? (template.policyBindings as PolicyBinding[]) : [];
    const evals = Array.isArray(template.evalBindings) ? (template.evalBindings as EvalBinding[]) : [];
    const rollback = template.rollbackPlan as RollbackPlan;

    setEditData({
      name: template.name,
      description: template.description || "",
      category: template.category,
      industry: template.industry || "cross_industry",
      complexity: template.complexity || "medium",
      defaultRiskTier: template.defaultRiskTier || "MEDIUM",
      defaultAutonomyMode: template.defaultAutonomyMode || "assisted",
      modelProvider: template.modelProvider || "openai",
      modelName: template.modelName || "gpt-4.1",
      tags: [...(template.tags || [])],
      newTag: "",
      tools: tools.map(t => ({ ...t, permissions: t.permissions ? [...t.permissions] : [] })),
      workflowNodes: workflow?.nodes ? workflow.nodes.map(n => ({ ...n })) : [],
      dataAccess: permissions?.dataAccess ? permissions.dataAccess.join(", ") : "",
      apiAccess: permissions?.apiAccess ? permissions.apiAccess.join(", ") : "",
      writeAccess: permissions?.writeAccess ? permissions.writeAccess.join(", ") : "",
      memoryRagConfig: memory ? { ...memory } : null,
      policyBindings: policies.map(p => ({ ...p })),
      evalBindings: evals.map(e => ({ ...e })),
      rollbackPlan: rollback ? { triggerConditions: [...rollback.triggerConditions], rollbackTargetVersion: rollback.rollbackTargetVersion } : null,
      newTriggerCondition: "",
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditData({});
  };

  const handleSave = () => {
    const dataAccessArr = editData.dataAccess ? editData.dataAccess.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    const apiAccessArr = editData.apiAccess ? editData.apiAccess.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
    const writeAccessArr = editData.writeAccess ? editData.writeAccess.split(",").map((s: string) => s.trim()).filter(Boolean) : [];

    const body: Record<string, any> = {
      name: editData.name,
      description: editData.description,
      category: editData.category,
      industry: editData.industry,
      complexity: editData.complexity,
      defaultRiskTier: editData.defaultRiskTier,
      defaultAutonomyMode: editData.defaultAutonomyMode,
      modelProvider: editData.modelProvider,
      modelName: editData.modelName,
      tags: editData.tags,
      toolsConfig: editData.tools,
      blueprintJson: { nodes: editData.workflowNodes },
      permissionsConfig: { dataAccess: dataAccessArr, apiAccess: apiAccessArr, writeAccess: writeAccessArr },
      memoryRagConfig: editData.memoryRagConfig,
      policyBindings: editData.policyBindings,
      evalBindings: editData.evalBindings,
      rollbackPlan: editData.rollbackPlan,
    };

    if (isNew) {
      createMutation.mutate(body);
    } else {
      updateMutation.mutate(body);
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!isNew && !template) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Layers className="w-12 h-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Template not found</p>
        <Link href="/templates">
          <Button variant="outline" data-testid="button-back-templates">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Templates
          </Button>
        </Link>
      </div>
    );
  }

  const displayTemplate = template || null;
  const IconComponent = iconMap[displayTemplate?.icon || editData.icon || "bot"] || Bot;
  const tools = displayTemplate ? (Array.isArray(displayTemplate.toolsConfig) ? (displayTemplate.toolsConfig as ToolConfig[]) : []) : [];
  const workflow = displayTemplate ? (displayTemplate.blueprintJson as { nodes?: WorkflowNode[] } | null) : null;
  const permissions = displayTemplate ? (displayTemplate.permissionsConfig as PermissionsConfig | null) : null;
  const memory = displayTemplate ? (displayTemplate.memoryRagConfig as MemoryRagConfig) : null;
  const policyBindings = displayTemplate ? (Array.isArray(displayTemplate.policyBindings) ? (displayTemplate.policyBindings as PolicyBinding[]) : []) : [];
  const evalBindings = displayTemplate ? (Array.isArray(displayTemplate.evalBindings) ? (displayTemplate.evalBindings as EvalBinding[]) : []) : [];
  const rollback = displayTemplate ? (displayTemplate.rollbackPlan as RollbackPlan) : null;

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-template-detail">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/templates">
          <Button variant="ghost" size="icon" data-testid="button-back-templates">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <IconComponent className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="font-semibold text-lg"
                  data-testid="input-template-name"
                />
                <Textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  className="text-sm"
                  rows={2}
                  data-testid="input-template-description"
                />
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold tracking-tight" data-testid="text-template-name">{displayTemplate?.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-template-description">{displayTemplate?.description}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {editing ? (
          <>
            <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v })}>
              <SelectTrigger className="w-44" data-testid="select-edit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map(c => (
                  <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editData.industry} onValueChange={(v) => setEditData({ ...editData, industry: v })}>
              <SelectTrigger className="w-44" data-testid="select-edit-industry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allIndustries.map(i => (
                  <SelectItem key={i} value={i}>{industryLabels[i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editData.complexity} onValueChange={(v) => setEditData({ ...editData, complexity: v })}>
              <SelectTrigger className="w-32" data-testid="select-edit-complexity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {complexityOptions.map(c => (
                  <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editData.defaultRiskTier} onValueChange={(v) => setEditData({ ...editData, defaultRiskTier: v })}>
              <SelectTrigger className="w-32" data-testid="select-edit-risk-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {riskTierOptions.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={editData.defaultAutonomyMode} onValueChange={(v) => setEditData({ ...editData, defaultAutonomyMode: v })}>
              <SelectTrigger className="w-36" data-testid="select-edit-autonomy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {autonomyOptions.map(a => (
                  <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <>
            <Badge variant="outline" className="text-[10px]">{categoryLabels[displayTemplate?.category || "general"] || displayTemplate?.category}</Badge>
            <Badge variant="secondary" className="text-[10px]">{industryLabels[displayTemplate?.industry || "cross_industry"] || displayTemplate?.industry}</Badge>
            <Badge variant="outline" className="text-[10px]">{(displayTemplate?.complexity || "medium").toUpperCase()}</Badge>
            <Badge variant="outline" className="text-[10px]">{displayTemplate?.defaultRiskTier || "MEDIUM"} Risk</Badge>
            <Badge variant="outline" className="text-[10px]">{displayTemplate?.defaultAutonomyMode || "assisted"}</Badge>
          </>
        )}
        <div className="flex-1" />
        {editing ? (
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button variant="outline" onClick={cancelEditing} data-testid="button-cancel-edit">
                <X className="w-4 h-4 mr-1.5" /> Cancel
              </Button>
            )}
            <Button onClick={handleSave} disabled={updateMutation.isPending || createMutation.isPending} data-testid="button-save-template">
              <Save className="w-4 h-4 mr-1.5" /> {(updateMutation.isPending || createMutation.isPending) ? "Saving..." : isNew ? "Create Template" : "Save"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={startEditing} data-testid="button-edit-template">
              <Pencil className="w-4 h-4 mr-1.5" /> Edit
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(true)} data-testid="button-delete-template">
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete
            </Button>
            <Button onClick={() => navigate(`/agents/wizard?templateId=${templateId}`)} data-testid="button-use-template">
              Use This Template <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Model Config
            </div>
            {editing ? (
              <div className="flex flex-col gap-2 mt-2">
                <Input
                  value={editData.modelProvider}
                  onChange={(e) => setEditData({ ...editData, modelProvider: e.target.value })}
                  placeholder="Provider"
                  data-testid="input-edit-model-provider"
                />
                <Input
                  value={editData.modelName}
                  onChange={(e) => setEditData({ ...editData, modelName: e.target.value })}
                  placeholder="Model name"
                  data-testid="input-edit-model-name"
                />
              </div>
            ) : (
              <p className="text-sm font-medium mt-1" data-testid="text-model-config">{displayTemplate?.modelProvider} / {displayTemplate?.modelName}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5" /> Risk & Autonomy
            </div>
            <p className="text-sm font-medium mt-1" data-testid="text-risk-autonomy">
              {displayTemplate?.defaultRiskTier} / {displayTemplate?.defaultAutonomyMode}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5" /> Complexity
            </div>
            <p className="text-sm font-medium mt-1" data-testid="text-complexity">
              {(displayTemplate?.complexity || "medium").charAt(0).toUpperCase() + (displayTemplate?.complexity || "medium").slice(1)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wrench className="w-4 h-4 text-muted-foreground" /> Tools ({editing ? editData.tools?.length || 0 : tools.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {editing ? (
              <>
                {(editData.tools || []).map((tool: ToolConfig, idx: number) => (
                  <div key={idx} className="flex flex-col gap-1.5 p-3 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Input
                        value={tool.name}
                        onChange={(e) => {
                          const updated = [...editData.tools];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          setEditData({ ...editData, tools: updated });
                        }}
                        placeholder="Tool name"
                        className="flex-1"
                        data-testid={`input-tool-name-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const updated = editData.tools.filter((_: any, i: number) => i !== idx);
                          setEditData({ ...editData, tools: updated });
                        }}
                        data-testid={`button-remove-tool-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      value={tool.description}
                      onChange={(e) => {
                        const updated = [...editData.tools];
                        updated[idx] = { ...updated[idx], description: e.target.value };
                        setEditData({ ...editData, tools: updated });
                      }}
                      placeholder="Description"
                      data-testid={`input-tool-desc-${idx}`}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditData({ ...editData, tools: [...(editData.tools || []), { name: "", description: "", permissions: [] }] })}
                  data-testid="button-add-tool"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Tool
                </Button>
              </>
            ) : tools.length > 0 ? (
              tools.map((tool, idx) => (
                <div key={idx} className="flex flex-col gap-0.5 p-3 rounded-md bg-muted/50">
                  <span className="text-sm font-medium" data-testid={`text-tool-name-${idx}`}>{tool.name}</span>
                  <span className="text-xs text-muted-foreground">{tool.description}</span>
                  {tool.permissions && tool.permissions.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {tool.permissions.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[9px]">{p}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No tools configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" /> Workflow ({editing ? editData.workflowNodes?.length || 0 : workflow?.nodes?.length || 0} steps)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              <>
                {(editData.workflowNodes || []).map((node: WorkflowNode, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">{node.type}</Badge>
                    <Input
                      value={node.label}
                      onChange={(e) => {
                        const updated = [...editData.workflowNodes];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setEditData({ ...editData, workflowNodes: updated });
                      }}
                      className="flex-1"
                      data-testid={`input-workflow-label-${idx}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const updated = editData.workflowNodes.filter((_: any, i: number) => i !== idx);
                        setEditData({ ...editData, workflowNodes: updated });
                      }}
                      data-testid={`button-remove-node-${idx}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newId = `node_${Date.now()}`;
                    setEditData({
                      ...editData,
                      workflowNodes: [...(editData.workflowNodes || []), { id: newId, type: "action", label: "" }],
                    });
                  }}
                  data-testid="button-add-node"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Step
                </Button>
              </>
            ) : workflow?.nodes && workflow.nodes.length > 0 ? (
              workflow.nodes.map((node, idx) => (
                <div key={node.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{node.type}</Badge>
                  <span className="text-muted-foreground" data-testid={`text-workflow-label-${idx}`}>{node.label}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No workflow defined</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" /> Permissions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {editing ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Data Access (comma-separated)</label>
                  <Input
                    value={editData.dataAccess}
                    onChange={(e) => setEditData({ ...editData, dataAccess: e.target.value })}
                    placeholder="e.g., tickets, users, kb_articles"
                    data-testid="input-edit-data-access"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">API Access (comma-separated)</label>
                  <Input
                    value={editData.apiAccess}
                    onChange={(e) => setEditData({ ...editData, apiAccess: e.target.value })}
                    placeholder="e.g., crm_api, email_api"
                    data-testid="input-edit-api-access"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Write Access (comma-separated)</label>
                  <Input
                    value={editData.writeAccess}
                    onChange={(e) => setEditData({ ...editData, writeAccess: e.target.value })}
                    placeholder="e.g., ticket_responses, notes"
                    data-testid="input-edit-write-access"
                  />
                </div>
              </div>
            ) : permissions ? (
              <div className="flex flex-col gap-2">
                {(permissions.dataAccess || []).length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Data Access: </span>
                    <span>{permissions.dataAccess!.join(", ")}</span>
                  </div>
                )}
                {(permissions.apiAccess || []).length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">API Access: </span>
                    <span>{permissions.apiAccess!.join(", ")}</span>
                  </div>
                )}
                {(permissions.writeAccess || []).length > 0 && (
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Write Access: </span>
                    <span>{permissions.writeAccess!.join(", ")}</span>
                  </div>
                )}
                {!(permissions.dataAccess?.length || permissions.apiAccess?.length || permissions.writeAccess?.length) && (
                  <p className="text-xs text-muted-foreground">No permissions configured</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No permissions configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Brain className="w-4 h-4 text-muted-foreground" /> Memory & RAG
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              editData.memoryRagConfig ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={editData.memoryRagConfig.vectorStore}
                    onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, vectorStore: e.target.value } })}
                    placeholder="Vector store"
                    data-testid="input-edit-vector-store"
                  />
                  <Input
                    value={editData.memoryRagConfig.retrievalStrategy}
                    onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, retrievalStrategy: e.target.value } })}
                    placeholder="Retrieval strategy"
                    data-testid="input-edit-retrieval-strategy"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      value={editData.memoryRagConfig.chunkSize}
                      onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, chunkSize: parseInt(e.target.value) || 0 } })}
                      placeholder="Chunk size"
                      data-testid="input-edit-chunk-size"
                    />
                    <Input
                      value={editData.memoryRagConfig.embeddingModel}
                      onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, embeddingModel: e.target.value } })}
                      placeholder="Embedding model"
                      data-testid="input-edit-embedding-model"
                    />
                    <Input
                      type="number"
                      value={editData.memoryRagConfig.topK}
                      onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, topK: parseInt(e.target.value) || 0 } })}
                      placeholder="Top K"
                      data-testid="input-edit-top-k"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Not configured</p>
              )
            ) : memory ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Vector Store: </span>
                  <span className="font-medium">{memory.vectorStore}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Strategy: </span>
                  <span className="font-medium">{memory.retrievalStrategy}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Chunk Size: </span>
                  <span className="font-medium">{memory.chunkSize}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Embedding: </span>
                  <span className="font-medium">{memory.embeddingModel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Top K: </span>
                  <span className="font-medium">{memory.topK}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-muted-foreground" /> Policy Bindings ({editing ? editData.policyBindings?.length || 0 : policyBindings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              <>
                {(editData.policyBindings || []).map((p: PolicyBinding, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={p.policyName}
                      onChange={(e) => {
                        const updated = [...editData.policyBindings];
                        updated[idx] = { ...updated[idx], policyName: e.target.value };
                        setEditData({ ...editData, policyBindings: updated });
                      }}
                      placeholder="Policy name"
                      className="flex-1"
                      data-testid={`input-policy-name-${idx}`}
                    />
                    <Select
                      value={p.enforcement}
                      onValueChange={(v) => {
                        const updated = [...editData.policyBindings];
                        updated[idx] = { ...updated[idx], enforcement: v };
                        setEditData({ ...editData, policyBindings: updated });
                      }}
                    >
                      <SelectTrigger className="w-28" data-testid={`select-policy-enforcement-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {enforcementOptions.map(e => (
                          <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const updated = editData.policyBindings.filter((_: any, i: number) => i !== idx);
                        setEditData({ ...editData, policyBindings: updated });
                      }}
                      data-testid={`button-remove-policy-${idx}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditData({ ...editData, policyBindings: [...(editData.policyBindings || []), { policyName: "", enforcement: "soft" }] })}
                  data-testid="button-add-policy"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Policy
                </Button>
              </>
            ) : policyBindings.length > 0 ? (
              policyBindings.map((p, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span data-testid={`text-policy-name-${idx}`}>{p.policyName}</span>
                  <Badge variant={p.enforcement === "hard" ? "destructive" : "secondary"} className="text-[9px]">
                    {p.enforcement}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No policy bindings</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-muted-foreground" /> Eval Bindings ({editing ? editData.evalBindings?.length || 0 : evalBindings.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              <>
                {(editData.evalBindings || []).map((e: EvalBinding, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={e.suiteName}
                      onChange={(ev) => {
                        const updated = [...editData.evalBindings];
                        updated[idx] = { ...updated[idx], suiteName: ev.target.value };
                        setEditData({ ...editData, evalBindings: updated });
                      }}
                      placeholder="Suite name"
                      className="flex-1"
                      data-testid={`input-eval-name-${idx}`}
                    />
                    <Select
                      value={e.schedule}
                      onValueChange={(v) => {
                        const updated = [...editData.evalBindings];
                        updated[idx] = { ...updated[idx], schedule: v };
                        setEditData({ ...editData, evalBindings: updated });
                      }}
                    >
                      <SelectTrigger className="w-32" data-testid={`select-eval-schedule-${idx}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {scheduleOptions.map(s => (
                          <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const updated = editData.evalBindings.filter((_: any, i: number) => i !== idx);
                        setEditData({ ...editData, evalBindings: updated });
                      }}
                      data-testid={`button-remove-eval-${idx}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditData({ ...editData, evalBindings: [...(editData.evalBindings || []), { suiteName: "", schedule: "on_deploy" }] })}
                  data-testid="button-add-eval"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Add Eval Binding
                </Button>
              </>
            ) : evalBindings.length > 0 ? (
              evalBindings.map((e, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span data-testid={`text-eval-name-${idx}`}>{e.suiteName}</span>
                  <Badge variant="outline" className="text-[9px]">{e.schedule}</Badge>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No eval bindings</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-muted-foreground" /> Rollback Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              editData.rollbackPlan ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground">Rollback Target Version</label>
                  <Input
                    value={editData.rollbackPlan.rollbackTargetVersion}
                    onChange={(e) => setEditData({
                      ...editData,
                      rollbackPlan: { ...editData.rollbackPlan, rollbackTargetVersion: e.target.value },
                    })}
                    placeholder="e.g., 1.0.0"
                    data-testid="input-edit-rollback-target"
                  />
                  <label className="text-xs text-muted-foreground mt-1">Trigger Conditions</label>
                  {(editData.rollbackPlan.triggerConditions || []).map((cond: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={cond}
                        onChange={(e) => {
                          const updated = [...editData.rollbackPlan.triggerConditions];
                          updated[idx] = e.target.value;
                          setEditData({
                            ...editData,
                            rollbackPlan: { ...editData.rollbackPlan, triggerConditions: updated },
                          });
                        }}
                        className="flex-1"
                        data-testid={`input-trigger-condition-${idx}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const updated = editData.rollbackPlan.triggerConditions.filter((_: any, i: number) => i !== idx);
                          setEditData({
                            ...editData,
                            rollbackPlan: { ...editData.rollbackPlan, triggerConditions: updated },
                          });
                        }}
                        data-testid={`button-remove-trigger-${idx}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditData({
                      ...editData,
                      rollbackPlan: {
                        ...editData.rollbackPlan,
                        triggerConditions: [...(editData.rollbackPlan.triggerConditions || []), ""],
                      },
                    })}
                    data-testid="button-add-trigger"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add Condition
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Not configured</p>
              )
            ) : rollback ? (
              <div className="flex flex-col gap-2">
                <div className="text-xs">
                  <span className="text-muted-foreground">Target: </span>
                  <span className="font-medium">{rollback.rollbackTargetVersion}</span>
                </div>
                <div className="text-xs text-muted-foreground">Trigger Conditions:</div>
                {rollback.triggerConditions.map((cond, idx) => (
                  <div key={idx} className="text-xs flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{cond}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" /> Tags
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {editing ? (
              <>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(editData.tags || []).map((t: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                      {t}
                      <button
                        onClick={() => {
                          const updated = editData.tags.filter((_: any, i: number) => i !== idx);
                          setEditData({ ...editData, tags: updated });
                        }}
                        className="ml-0.5"
                        data-testid={`button-remove-tag-${idx}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={editData.newTag || ""}
                    onChange={(e) => setEditData({ ...editData, newTag: e.target.value })}
                    placeholder="Add tag"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && editData.newTag?.trim()) {
                        e.preventDefault();
                        setEditData({
                          ...editData,
                          tags: [...(editData.tags || []), editData.newTag.trim()],
                          newTag: "",
                        });
                      }
                    }}
                    data-testid="input-add-tag"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (editData.newTag?.trim()) {
                        setEditData({
                          ...editData,
                          tags: [...(editData.tags || []), editData.newTag.trim()],
                          newTag: "",
                        });
                      }
                    }}
                    data-testid="button-add-tag"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (displayTemplate?.tags || []).length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                {(displayTemplate?.tags || []).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No tags</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
