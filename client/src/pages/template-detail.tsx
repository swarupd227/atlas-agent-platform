import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import type { AgentTemplate } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Wand2,
  Loader2,
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
  CheckCircle2,
  XCircle,
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
  Search,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { Skill } from "@shared/schema";

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
  insurance: "Insurance",
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
  "cross_industry", "technology", "financial_services", "insurance", "healthcare",
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
  const { industry } = useIndustry();
  const templateId = params?.id;
  const isNew = templateId === "new";

  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const startInEditMode = searchParams.get("edit") === "true";

  const [editing, setEditing] = useState(isNew || startInEditMode);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enhancePreview, setEnhancePreview] = useState<Record<string, any> | null>(null);
  const [enhanceDialogOpen, setEnhanceDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [customization, setCustomization] = useState({
    dataSources: {} as Record<string, string>,
    costCeiling: "",
    qualityFloor: "",
    riskTolerance: "",
    maxLatency: "500",
    additionalSkills: [] as string[],
    newSkill: "",
  });
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [skillLibraryOpen, setSkillLibraryOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  const [policySearchOpen, setPolicySearchOpen] = useState(false);
  const [policySearchQuery, setPolicySearchQuery] = useState("");
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
    complianceCertifications: [] as string[],
    newCert: "",
    policyBindings: [] as PolicyBinding[],
    evalBindings: [] as EvalBinding[],
    triggerConditions: [""],
    rollbackTargetVersion: "previous_stable",
  } : {});

  const { data: template, isLoading } = useQuery<AgentTemplate>({
    queryKey: ["/api/agent-templates", templateId],
    enabled: !!templateId && !isNew,
  });

  const { data: allSkills } = useQuery<Skill[]>({
    queryKey: ["/api/skills"],
    enabled: skillLibraryOpen,
  });

  const { data: policyLibrary } = useQuery<Array<{ id: string; name: string; domain: string; description: string }>>({
    queryKey: ["/api/policies"],
  });

  useEffect(() => {
    if (template && editing && Object.keys(editData).length === 0) {
      const tools = Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [];
      const workflow = template.blueprintJson as { nodes?: WorkflowNode[] } | null;
      const permissions = template.permissionsConfig as PermissionsConfig | null;
      const memoryConfig = template.memoryRagConfig as MemoryRagConfig;
      const policies = Array.isArray(template.policyBindings) ? (template.policyBindings as PolicyBinding[]) : [];
      const evals = Array.isArray(template.evalBindings) ? (template.evalBindings as EvalBinding[]) : [];
      const rollbackData = template.rollbackPlan as RollbackPlan;

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
        memoryRagConfig: memoryConfig ? { ...memoryConfig } : null,
        policyBindings: policies.map(p => ({ ...p })),
        evalBindings: evals.map(e => ({ ...e })),
        rollbackPlan: rollbackData ? { triggerConditions: [...rollbackData.triggerConditions], rollbackTargetVersion: rollbackData.rollbackTargetVersion } : null,
        preloadedSkills: Array.isArray(template.preloadedSkills) ? (template.preloadedSkills as any[]).map((s: any) => ({ ...s })) : [],
        newTriggerCondition: "",
      });
    }
  }, [template, editing]);

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

  const enhanceMutation = useMutation({
    mutationFn: async (templateData: Record<string, any>) => {
      const { _currentIndustry, ...template } = templateData;
      const res = await apiRequest("POST", "/api/ai/enhance-template", { template, currentIndustry: _currentIndustry });
      return res.json();
    },
    onSuccess: (data: any) => {
      const enhanced = data.enhanced || {};
      setEnhancePreview(enhanced);
      setEnhanceDialogOpen(true);
    },
    onError: (err: Error) => {
      toast({ title: "Enhancement failed", description: err.message, variant: "destructive" });
    },
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deployments", {
        agentName: `${template?.name} - Shadow Deploy`,
        agentId: template?.id,
        environment: "shadow",
        rolloutStrategy: "shadow",
        status: "pending",
        version: "1.0.0",
        shadowEnabled: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deployments"] });
      setDeployDialogOpen(false);
      toast({ title: "Deployment initiated", description: "Template deployed to shadow replay pipeline. Golden evaluation dataset will run automatically." });
    },
    onError: (err: Error) => {
      toast({ title: "Deployment failed", description: err.message, variant: "destructive" });
    },
  });

  const applyEnhancement = () => {
    if (!enhancePreview) return;
    const enhanced = enhancePreview;
    setEditData((prev: Record<string, any>) => {
      const merged = { ...prev };
      if (enhanced.description) merged.description = enhanced.description;
      if (enhanced.tools && Array.isArray(enhanced.tools)) {
        merged.tools = enhanced.tools.map((t: any) => ({
          name: t.name || "",
          description: t.description || "",
          permissions: Array.isArray(t.permissions) ? t.permissions : [],
        }));
      }
      if (enhanced.workflowNodes && Array.isArray(enhanced.workflowNodes)) {
        merged.workflowNodes = enhanced.workflowNodes.map((n: any, i: number) => ({
          id: n.id || `step_${i + 1}`,
          type: n.type || "llm_call",
          label: n.label || "",
        }));
      }
      if (enhanced.dataAccess) merged.dataAccess = Array.isArray(enhanced.dataAccess) ? enhanced.dataAccess.join(", ") : enhanced.dataAccess;
      if (enhanced.apiAccess) merged.apiAccess = Array.isArray(enhanced.apiAccess) ? enhanced.apiAccess.join(", ") : enhanced.apiAccess;
      if (enhanced.writeAccess) merged.writeAccess = Array.isArray(enhanced.writeAccess) ? enhanced.writeAccess.join(", ") : enhanced.writeAccess;
      if (enhanced.permissions) {
        if (enhanced.permissions.dataAccess) merged.dataAccess = Array.isArray(enhanced.permissions.dataAccess) ? enhanced.permissions.dataAccess.join(", ") : enhanced.permissions.dataAccess;
        if (enhanced.permissions.apiAccess) merged.apiAccess = Array.isArray(enhanced.permissions.apiAccess) ? enhanced.permissions.apiAccess.join(", ") : enhanced.permissions.apiAccess;
        if (enhanced.permissions.writeAccess) merged.writeAccess = Array.isArray(enhanced.permissions.writeAccess) ? enhanced.permissions.writeAccess.join(", ") : enhanced.permissions.writeAccess;
      }
      if (enhanced.memoryRagConfig || enhanced.memoryRag) {
        const rag = enhanced.memoryRagConfig || enhanced.memoryRag;
        merged.memoryRagConfig = {
          vectorStore: rag.vectorStore || "",
          retrievalStrategy: rag.retrievalStrategy || "semantic",
          chunkSize: rag.chunkSize || 512,
          embeddingModel: rag.embeddingModel || "text-embedding-3-small",
          topK: rag.topK || 5,
        };
      }
      if (enhanced.policyBindings && Array.isArray(enhanced.policyBindings)) {
        merged.policyBindings = enhanced.policyBindings.map((p: any) => ({
          policyName: p.policyName || p.name || "",
          enforcement: p.enforcement || "soft",
        }));
      }
      if (enhanced.evalBindings && Array.isArray(enhanced.evalBindings)) {
        merged.evalBindings = enhanced.evalBindings.map((e: any) => ({
          suiteName: e.suiteName || e.name || "",
          schedule: e.schedule || "on_deploy",
        }));
      }
      if (enhanced.rollbackPlan) {
        merged.rollbackPlan = {
          triggerConditions: Array.isArray(enhanced.rollbackPlan.triggerConditions) ? enhanced.rollbackPlan.triggerConditions : [""],
          rollbackTargetVersion: enhanced.rollbackPlan.rollbackTargetVersion || "previous_stable",
        };
      }
      if (enhanced.complianceCertifications && Array.isArray(enhanced.complianceCertifications)) merged.complianceCertifications = enhanced.complianceCertifications;
      if (enhanced.tags && Array.isArray(enhanced.tags)) merged.tags = enhanced.tags;
      if (enhanced.preloadedSkills && Array.isArray(enhanced.preloadedSkills)) {
        merged.preloadedSkills = enhanced.preloadedSkills.map((s: any) => ({
          skillId: s.skillId || "",
          skillName: s.skillName || "",
          domain: s.domain || "",
        }));
      }
      if (enhanced.complexity && ["low","medium","high"].includes(enhanced.complexity)) merged.complexity = enhanced.complexity;
      if (enhanced.defaultRiskTier && ["LOW","MEDIUM","HIGH","CRITICAL"].includes(enhanced.defaultRiskTier)) merged.defaultRiskTier = enhanced.defaultRiskTier;
      if (enhanced.defaultAutonomyMode && ["autonomous","assisted","supervised","manual"].includes(enhanced.defaultAutonomyMode)) merged.defaultAutonomyMode = enhanced.defaultAutonomyMode;
      return merged;
    });
    setEnhanceDialogOpen(false);
    setEnhancePreview(null);
    toast({ title: "Enhancement applied", description: "AI suggestions have been applied to the form. Review and save when ready." });
  };

  const handleEnhance = () => {
    enhanceMutation.mutate({ ...editData, _currentIndustry: industry?.id });
  };

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
      complianceCertifications: [...(template.complianceCertifications || [])],
      newCert: "",
      tools: tools.map(t => ({ ...t, permissions: t.permissions ? [...t.permissions] : [] })),
      workflowNodes: workflow?.nodes ? workflow.nodes.map(n => ({ ...n })) : [],
      dataAccess: permissions?.dataAccess ? permissions.dataAccess.join(", ") : "",
      apiAccess: permissions?.apiAccess ? permissions.apiAccess.join(", ") : "",
      writeAccess: permissions?.writeAccess ? permissions.writeAccess.join(", ") : "",
      memoryRagConfig: memory ? { ...memory } : null,
      policyBindings: policies.map(p => ({ ...p })),
      evalBindings: evals.map(e => ({ ...e })),
      rollbackPlan: rollback ? { triggerConditions: [...rollback.triggerConditions], rollbackTargetVersion: rollback.rollbackTargetVersion } : null,
      preloadedSkills: Array.isArray(template.preloadedSkills) ? (template.preloadedSkills as any[]).map((s: any) => ({ ...s })) : [],
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
      complianceCertifications: editData.complianceCertifications || [],
      policyBindings: editData.policyBindings,
      evalBindings: editData.evalBindings,
      rollbackPlan: editData.rollbackPlan,
      preloadedSkills: editData.preloadedSkills || [],
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
  const costProfile = displayTemplate?.costProfile as { monthlyEstimate?: number; perRunCost?: number; tier?: string } | null;
  const complianceCerts = displayTemplate?.complianceCertifications || [];

  const handleFixCompliance = (fixType: string) => {
    if (!template) return;
    const tls = Array.isArray(template.toolsConfig) ? (template.toolsConfig as ToolConfig[]) : [];
    const wf = template.blueprintJson as { nodes?: WorkflowNode[] } | null;
    const perms = template.permissionsConfig as PermissionsConfig | null;
    const memCfg = template.memoryRagConfig as MemoryRagConfig;
    const pb = Array.isArray(template.policyBindings) ? (template.policyBindings as PolicyBinding[]) : [];
    const eb = Array.isArray(template.evalBindings) ? (template.evalBindings as EvalBinding[]) : [];
    const rb = template.rollbackPlan as RollbackPlan;

    const newEditData: Record<string, any> = {
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
      complianceCertifications: [...(template.complianceCertifications || [])],
      newCert: "",
      tools: tls.map(t => ({ ...t, permissions: t.permissions ? [...t.permissions] : [] })),
      workflowNodes: wf?.nodes ? wf.nodes.map(n => ({ ...n })) : [],
      dataAccess: perms?.dataAccess ? perms.dataAccess.join(", ") : "",
      apiAccess: perms?.apiAccess ? perms.apiAccess.join(", ") : "",
      writeAccess: perms?.writeAccess ? perms.writeAccess.join(", ") : "",
      memoryRagConfig: memCfg ? { ...memCfg } : null,
      policyBindings: pb.map(p => ({ ...p })),
      evalBindings: eb.map(e => ({ ...e })),
      rollbackPlan: rb ? { triggerConditions: [...rb.triggerConditions], rollbackTargetVersion: rb.rollbackTargetVersion } : null,
      newTriggerCondition: "",
    };

    if (fixType === "policies" && !pb.some(p => p.enforcement === "hard")) {
      setPolicySearchOpen(true);
    }

    setEditData(newEditData);
    setEditing(true);

    const fixMessages: Record<string, { title: string; description: string }> = {
      tools: { title: "Fix: MCP Servers", description: "Add tools/MCP servers in the edit form below." },
      permissions: { title: "Fix: Data Classifications", description: "Configure data access permissions in the edit form." },
      policies: { title: "Fix: Approval Flows", description: "Select a policy from the library and set it to 'Hard' enforcement." },
      certs: { title: "Fix: Audit Retention", description: "Add compliance certifications in the edit form." },
    };
    const msg = fixMessages[fixType];
    if (msg) toast(msg);
  };

  const complianceChecks = [
    { label: "MCP Servers Available", pass: tools.length > 0, remedy: "Add at least one tool/MCP server in the template configuration.", fixType: "tools" },
    { label: "Data Classifications Configured", pass: !!permissions, remedy: "Configure data access permissions in the template.", fixType: "permissions" },
    { label: "Approval Flows Defined", pass: policyBindings.some(p => p.enforcement === "hard"), remedy: "Add at least one policy binding with 'hard' enforcement level.", fixType: "policies" },
    { label: "Audit Retention Policies", pass: complianceCerts.length > 0, remedy: "Add compliance certifications to the template.", fixType: "certs" },
  ];
  const allChecksPassed = complianceChecks.every(c => c.pass);

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
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Template Name</label>
                  <Input
                    value={editData.name || ""}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                    className="font-semibold text-lg"
                    placeholder="Enter template name"
                    data-testid="input-template-name"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                  <Textarea
                    value={editData.description || ""}
                    onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                    className="text-sm"
                    rows={2}
                    placeholder="Describe what this agent template does"
                    data-testid="input-template-description"
                  />
                </div>
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
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <Select value={editData.category || "general"} onValueChange={(v) => setEditData({ ...editData, category: v })}>
                <SelectTrigger className="w-44" data-testid="select-edit-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {allCategories.map(c => (
                    <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Industry</label>
              <Select value={editData.industry || "cross_industry"} onValueChange={(v) => setEditData({ ...editData, industry: v })}>
                <SelectTrigger className="w-44" data-testid="select-edit-industry">
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent>
                  {allIndustries.map(i => (
                    <SelectItem key={i} value={i}>{industryLabels[i]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Complexity</label>
              <Select value={editData.complexity || "medium"} onValueChange={(v) => setEditData({ ...editData, complexity: v })}>
                <SelectTrigger className="w-32" data-testid="select-edit-complexity">
                  <SelectValue placeholder="Complexity" />
                </SelectTrigger>
                <SelectContent>
                  {complexityOptions.map(c => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Risk Tier</label>
              <Select value={editData.defaultRiskTier || "MEDIUM"} onValueChange={(v) => setEditData({ ...editData, defaultRiskTier: v })}>
                <SelectTrigger className="w-32" data-testid="select-edit-risk-tier">
                  <SelectValue placeholder="Risk Tier" />
                </SelectTrigger>
                <SelectContent>
                  {riskTierOptions.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Autonomy</label>
              <Select value={editData.defaultAutonomyMode || "assisted"} onValueChange={(v) => setEditData({ ...editData, defaultAutonomyMode: v })}>
                <SelectTrigger className="w-36" data-testid="select-edit-autonomy">
                  <SelectValue placeholder="Autonomy" />
                </SelectTrigger>
                <SelectContent>
                  {autonomyOptions.map(a => (
                    <SelectItem key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
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
            <Button
              variant="outline"
              onClick={handleEnhance}
              disabled={enhanceMutation.isPending || !editData.name}
              data-testid="button-ai-enhance"
            >
              {enhanceMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 mr-1.5" />
              )}
              {enhanceMutation.isPending ? "Enhancing..." : "AI Enhance"}
            </Button>
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

      {editing ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Model Config
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
                    <Input
                      value={editData.modelProvider || ""}
                      onChange={(e) => setEditData({ ...editData, modelProvider: e.target.value })}
                      placeholder="e.g., openai, anthropic, google"
                      data-testid="input-edit-model-provider"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Model Name</label>
                    <Input
                      value={editData.modelName || ""}
                      onChange={(e) => setEditData({ ...editData, modelName: e.target.value })}
                      placeholder="e.g., gpt-4.1, claude-sonnet-4-20250514"
                      data-testid="input-edit-model-name"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  <Shield className="w-3.5 h-3.5" /> Risk & Autonomy
                </div>
                <p className="text-sm font-medium mt-1" data-testid="text-risk-autonomy">
                  {editData.defaultRiskTier || "MEDIUM"} / {editData.defaultAutonomyMode || "assisted"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5" /> Complexity
                </div>
                <p className="text-sm font-medium mt-1" data-testid="text-complexity">
                  {(editData.complexity || "medium").charAt(0).toUpperCase() + (editData.complexity || "medium").slice(1)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" /> Tools ({editData.tools?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" /> Workflow ({editData.workflowNodes?.length || 0} steps)
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" /> Permissions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Brain className="w-4 h-4 text-muted-foreground" /> Memory & RAG
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {editData.memoryRagConfig ? (
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Vector Store</label>
                      <Input
                        value={editData.memoryRagConfig.vectorStore}
                        onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, vectorStore: e.target.value } })}
                        placeholder="e.g., pinecone, weaviate, chromadb"
                        data-testid="input-edit-vector-store"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Retrieval Strategy</label>
                      <Input
                        value={editData.memoryRagConfig.retrievalStrategy}
                        onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, retrievalStrategy: e.target.value } })}
                        placeholder="e.g., similarity, hybrid, mmr"
                        data-testid="input-edit-retrieval-strategy"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Chunk Size</label>
                        <Input
                          type="number"
                          value={editData.memoryRagConfig.chunkSize}
                          onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, chunkSize: parseInt(e.target.value) || 0 } })}
                          placeholder="512"
                          data-testid="input-edit-chunk-size"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Embedding Model</label>
                        <Input
                          value={editData.memoryRagConfig.embeddingModel}
                          onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, embeddingModel: e.target.value } })}
                          placeholder="text-embedding-3-small"
                          data-testid="input-edit-embedding-model"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Top K</label>
                        <Input
                          type="number"
                          value={editData.memoryRagConfig.topK}
                          onChange={(e) => setEditData({ ...editData, memoryRagConfig: { ...editData.memoryRagConfig, topK: parseInt(e.target.value) || 0 } })}
                          placeholder="5"
                          data-testid="input-edit-top-k"
                        />
                      </div>
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
                  <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Compliance Certifications ({editData.complianceCertifications?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {(editData.complianceCertifications || []).length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(editData.complianceCertifications || []).map((cert: string, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                        {cert}
                        <button
                          onClick={() => {
                            const updated = editData.complianceCertifications.filter((_: any, i: number) => i !== idx);
                            setEditData({ ...editData, complianceCertifications: updated });
                          }}
                          className="ml-0.5"
                          data-testid={`button-remove-cert-${idx}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    value={editData.newCert || ""}
                    onChange={(e) => setEditData({ ...editData, newCert: e.target.value })}
                    placeholder="e.g. SOC2, ISO-27001, HIPAA, GDPR, PCI-DSS"
                    className="flex-1"
                    data-testid="input-new-cert"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (editData.newCert || "").trim()) {
                        e.preventDefault();
                        setEditData({
                          ...editData,
                          complianceCertifications: [...(editData.complianceCertifications || []), editData.newCert.trim()],
                          newCert: "",
                        });
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if ((editData.newCert || "").trim()) {
                        setEditData({
                          ...editData,
                          complianceCertifications: [...(editData.complianceCertifications || []), editData.newCert.trim()],
                          newCert: "",
                        });
                      }
                    }}
                    data-testid="button-add-cert"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Add certifications like SOC2, ISO-27001, HIPAA, GDPR, PCI-DSS to satisfy audit retention policies.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ScrollText className="w-4 h-4 text-muted-foreground" /> Policy Bindings ({editData.policyBindings?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {(editData.policyBindings || []).map((p: PolicyBinding, idx: number) => (
                  <div key={idx} className="flex items-center gap-2 p-3 rounded-md bg-muted/30" data-testid={`policy-binding-${idx}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{p.policyName}</span>
                        {(p as any).domain && <Badge variant="outline" className="text-[9px]">{(p as any).domain}</Badge>}
                      </div>
                      {(p as any).description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{(p as any).description}</p>}
                    </div>
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
                {policySearchOpen ? (
                  <div className="flex flex-col gap-2 p-3 rounded-md border border-dashed">
                    <Input
                      value={policySearchQuery}
                      onChange={(e) => setPolicySearchQuery(e.target.value)}
                      placeholder="Search policies by name or domain..."
                      data-testid="input-search-policies-template"
                      autoFocus
                    />
                    <ScrollArea className="max-h-48">
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const boundIds = new Set((editData.policyBindings || []).map((b: any) => b.policyId).filter(Boolean));
                          const boundNames = new Set((editData.policyBindings || []).map((b: PolicyBinding) => b.policyName));
                          const available = (policyLibrary || []).filter(p => !boundIds.has(p.id) && !boundNames.has(p.name));
                          const filtered = available.filter(p =>
                            p.name.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
                            p.domain.toLowerCase().includes(policySearchQuery.toLowerCase()) ||
                            p.description.toLowerCase().includes(policySearchQuery.toLowerCase())
                          );
                          if (filtered.length === 0) return (
                            <p className="text-xs text-muted-foreground text-center py-3">
                              {available.length === 0 ? "All policies already bound" : "No matching policies found"}
                            </p>
                          );
                          return filtered.map(policy => (
                            <div
                              key={policy.id}
                              className="flex items-center gap-2 p-2 rounded-md cursor-pointer hover-elevate"
                              onClick={() => {
                                setEditData({
                                  ...editData,
                                  policyBindings: [
                                    ...(editData.policyBindings || []),
                                    { policyId: policy.id, policyName: policy.name, enforcement: "soft", domain: policy.domain, description: policy.description },
                                  ],
                                });
                                setPolicySearchOpen(false);
                                setPolicySearchQuery("");
                              }}
                              data-testid={`select-policy-${policy.id}`}
                            >
                              <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm">{policy.name}</span>
                                  <Badge variant="outline" className="text-[9px]">{policy.domain}</Badge>
                                </div>
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{policy.description}</p>
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </ScrollArea>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setPolicySearchOpen(false); setPolicySearchQuery(""); }}
                      data-testid="button-cancel-policy-search"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPolicySearchOpen(true)}
                    className="w-full"
                    data-testid="button-add-policy"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add Policy from Library
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-muted-foreground" /> Eval Bindings ({editData.evalBindings?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-muted-foreground" /> Rollback Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {editData.rollbackPlan ? (
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
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {/* Performance & Cost Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="section-performance-stats">
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Deployments</span>
                <span className="text-2xl font-semibold" data-testid="text-deployment-count">{displayTemplate?.deploymentCount || 0}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Avg KPI Delivery</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold" data-testid="text-avg-kpi">{displayTemplate?.avgKpiDelivery || 0}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted mt-1">
                  <div
                    className="h-2 rounded-full bg-green-600 dark:bg-green-500"
                    style={{ width: `${Math.min(displayTemplate?.avgKpiDelivery || 0, 100)}%` }}
                    data-testid="bar-kpi-delivery"
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Time to Production</span>
                <span className="text-2xl font-semibold" data-testid="text-time-to-prod">{displayTemplate?.estimatedTimeToProd || "2-4 weeks"}</span>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cost Profile</span>
                <span className="text-2xl font-semibold" data-testid="text-cost-profile">
                  {costProfile?.monthlyEstimate ? `$${costProfile.monthlyEstimate}/mo` : costProfile?.tier || "Standard"}
                </span>
                {costProfile?.perRunCost && (
                  <span className="text-xs text-muted-foreground">${costProfile.perRunCost}/run</span>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Template Anatomy Exploded View */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3" data-testid="heading-anatomy">Template Anatomy</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="section-anatomy">
              {/* 1. Agent Blueprint */}
              <Card data-testid="card-agent-blueprint">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Agent Blueprint
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Model: </span>
                    <span data-testid="text-model-config">{displayTemplate?.modelProvider} / {displayTemplate?.modelName}</span>
                  </div>
                  {workflow?.nodes && workflow.nodes.length > 0 && (
                    <div className="text-xs">
                      <span className="text-muted-foreground font-medium">Prompt Structure: </span>
                      <span>{workflow.nodes.length} workflow nodes</span>
                      <div className="flex flex-col gap-1 mt-1.5">
                        {workflow.nodes.map((node, idx) => (
                          <div key={node.id} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-4 shrink-0">{idx + 1}.</span>
                            <Badge variant="outline" className="text-[9px] shrink-0">{node.type}</Badge>
                            <span className="text-muted-foreground">{node.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Tool Bindings: </span>
                    <span>{tools.length} configured</span>
                  </div>
                </CardContent>
              </Card>

              {/* 2. Skill Set */}
              <Card data-testid="card-skill-set">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" /> Skill Set
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="text-xs text-muted-foreground font-medium">Pre-loaded Industry Skills</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]" data-testid="badge-skill-category">{categoryLabels[displayTemplate?.category || "general"] || displayTemplate?.category}</Badge>
                    <Badge variant="secondary" className="text-[10px]" data-testid="badge-skill-industry">{industryLabels[displayTemplate?.industry || "cross_industry"] || displayTemplate?.industry}</Badge>
                  </div>
                  {(() => {
                    const preloaded = Array.isArray(displayTemplate?.preloadedSkills) ? (displayTemplate.preloadedSkills as Array<{ skillId: string; skillName: string; domain: string }>) : [];
                    if (preloaded.length > 0) {
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {preloaded.map((s) => (
                            <Badge key={s.skillId || s.skillName} variant="outline" className="text-[10px] gap-1" data-testid={`badge-skill-${s.skillId || s.skillName}`}>
                              <Zap className="w-2.5 h-2.5" />{s.skillName}
                            </Badge>
                          ))}
                        </div>
                      );
                    }
                    if ((displayTemplate?.tags || []).length > 0) {
                      return (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {(displayTemplate?.tags || []).map((t) => (
                            <Badge key={t} variant="outline" className="text-[10px]" data-testid={`badge-tag-${t}`}>{t}</Badge>
                          ))}
                        </div>
                      );
                    }
                    return <p className="text-xs text-muted-foreground">No skills loaded</p>;
                  })()}
                </CardContent>
              </Card>

              {/* 3. MCP Connections */}
              <Card data-testid="card-mcp-connections">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Server className="w-4 h-4 text-primary" /> MCP Connections
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {tools.length > 0 ? (
                    <>
                      <div className="text-xs text-muted-foreground font-medium">Pre-configured MCP Servers/Tools</div>
                      {tools.map((tool, idx) => (
                        <div key={idx} className="flex flex-col gap-0.5 p-2 rounded-md bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Server className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium" data-testid={`text-mcp-tool-${idx}`}>{tool.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground ml-5">{tool.description}</span>
                          {tool.permissions && tool.permissions.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 ml-5 flex-wrap">
                              {tool.permissions.map((p) => (
                                <Badge key={p} variant="secondary" className="text-[9px]">{p}</Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No MCP connections configured</p>
                  )}
                </CardContent>
              </Card>

              {/* 3b. Permissions */}
              <Card data-testid="card-permissions">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Lock className="w-4 h-4 text-primary" /> Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {permissions ? (
                    <>
                      {(permissions.dataAccess || []).length > 0 && (
                        <div className="text-xs" data-testid="section-view-data-access">
                          <span className="text-muted-foreground font-medium">Data Access: </span>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {permissions.dataAccess!.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px]" data-testid={`badge-data-access-${a}`}>{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(permissions.apiAccess || []).length > 0 && (
                        <div className="text-xs" data-testid="section-view-api-access">
                          <span className="text-muted-foreground font-medium">API Access: </span>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {permissions.apiAccess!.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px]" data-testid={`badge-api-access-${a}`}>{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {(permissions.writeAccess || []).length > 0 && (
                        <div className="text-xs" data-testid="section-view-write-access">
                          <span className="text-muted-foreground font-medium">Write Access: </span>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {permissions.writeAccess!.map((a) => (
                              <Badge key={a} variant="outline" className="text-[10px]" data-testid={`badge-write-access-${a}`}>{a}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No permissions configured</p>
                  )}
                </CardContent>
              </Card>

              {/* 3c. Memory & RAG */}
              <Card data-testid="card-memory-rag">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" /> Memory & RAG
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {memory ? (
                    <>
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Vector Store: </span>
                        <span data-testid="text-view-vector-store">{memory.vectorStore}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Retrieval Strategy: </span>
                        <span data-testid="text-view-retrieval-strategy">{memory.retrievalStrategy}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Chunk Size: </span>
                        <span data-testid="text-view-chunk-size">{memory.chunkSize}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Embedding Model: </span>
                        <span data-testid="text-view-embedding-model">{memory.embeddingModel}</span>
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground font-medium">Top-K: </span>
                        <span data-testid="text-view-top-k">{memory.topK}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No memory / RAG configuration</p>
                  )}
                </CardContent>
              </Card>

              {/* 4. Governance Policies */}
              <Card data-testid="card-governance-policies">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Governance Policies
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {complianceCerts.length > 0 && (
                    <div>
                      <div className="text-xs text-muted-foreground font-medium mb-1">Compliance Certifications</div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {complianceCerts.map((cert: string) => (
                          <Badge key={cert} variant="outline" className="text-[10px]">{cert}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {policyBindings.length > 0 ? (
                    <div>
                      <div className="text-xs text-muted-foreground font-medium mb-1">Policy Bindings</div>
                      {policyBindings.map((p, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs mb-1">
                          <span data-testid={`text-policy-name-${idx}`}>{p.policyName}</span>
                          <Badge variant={p.enforcement === "hard" ? "destructive" : "secondary"} className="text-[9px]">
                            {p.enforcement}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No policy bindings configured</p>
                  )}
                </CardContent>
              </Card>

              {/* 5. Evaluation Suite */}
              <Card data-testid="card-evaluation-suite">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-primary" /> Evaluation Suite
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {evalBindings.length > 0 ? (
                    <>
                      {evalBindings.map((e, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span data-testid={`text-eval-name-${idx}`}>{e.suiteName}</span>
                          <Badge variant="outline" className="text-[9px]">{e.schedule}</Badge>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-green-600 dark:text-green-500" />
                        Golden evaluation dataset available
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No eval bindings configured</p>
                  )}
                </CardContent>
              </Card>

              {/* 6. Autonomy Profile */}
              <Card data-testid="card-autonomy-profile">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Brain className="w-4 h-4 text-primary" /> Autonomy Profile
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Risk Tier: </span>
                    <span data-testid="text-risk-tier">{displayTemplate?.defaultRiskTier || "MEDIUM"}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Autonomy Mode: </span>
                    <span data-testid="text-autonomy-mode">{displayTemplate?.defaultAutonomyMode || "assisted"}</span>
                  </div>
                  {rollback ? (
                    <div className="mt-1">
                      <div className="text-xs text-muted-foreground font-medium">Rollback Trigger Conditions:</div>
                      {rollback.triggerConditions.map((cond, idx) => (
                        <div key={idx} className="text-xs flex items-center gap-1.5 mt-0.5">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>{cond}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">No rollback plan configured</p>
                  )}
                </CardContent>
              </Card>

              {/* 7. Deployment Pipeline */}
              <Card className="lg:col-span-2" data-testid="card-deployment-pipeline">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Rocket className="w-4 h-4 text-primary" /> Deployment Pipeline
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="text-xs text-muted-foreground font-medium">Pre-configured Deployment Stages</div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-sm font-medium">Shadow Replay</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-sm font-medium">Canary</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                      <div className="w-2 h-2 rounded-full bg-green-600 dark:bg-green-500" />
                      <span className="text-sm font-medium">Production</span>
                    </div>
                  </div>
                  <div className="text-xs">
                    <span className="text-muted-foreground font-medium">Estimated Time-to-Prod: </span>
                    <span data-testid="text-pipeline-time">{displayTemplate?.estimatedTimeToProd || "2-4 weeks"}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Customization Wizard */}
          <div data-testid="section-customization-wizard">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Customize & Deploy</h2>
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center gap-1 p-4 border-b flex-wrap">
                  {[
                    { step: 1, label: "Data Sources" },
                    { step: 2, label: "Thresholds" },
                    { step: 3, label: "Additional Skills" },
                    { step: 4, label: "Review & Deploy" },
                  ].map((s) => (
                    <Button
                      key={s.step}
                      variant={wizardStep === s.step ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setWizardStep(s.step)}
                      data-testid={`button-wizard-step-${s.step}`}
                    >
                      <span className="mr-1.5 font-semibold">{s.step}.</span> {s.label}
                    </Button>
                  ))}
                </div>

                <div className="p-4">
                  {wizardStep === 1 && (
                    <div className="flex flex-col gap-4" data-testid="wizard-step-1">
                      <div>
                        <h3 className="text-sm font-medium mb-1">Connect Organization Data Sources</h3>
                        <p className="text-xs text-muted-foreground mb-3">Connect your organization-specific data sources based on the template requirements.</p>
                      </div>
                      {(permissions?.dataAccess || []).length > 0 ? (
                        (permissions!.dataAccess || []).map((source) => (
                          <div key={source}>
                            <label className="text-xs text-muted-foreground mb-1 block font-medium">{source}</label>
                            <Input
                              value={customization.dataSources[source] || ""}
                              onChange={(e) => setCustomization({
                                ...customization,
                                dataSources: { ...customization.dataSources, [source]: e.target.value },
                              })}
                              placeholder={`Enter connection URL or path for ${source}`}
                              data-testid={`input-datasource-${source}`}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No specific data sources required by this template.</p>
                      )}
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="flex flex-col gap-4" data-testid="wizard-step-2">
                      <div>
                        <h3 className="text-sm font-medium mb-1">Organization Thresholds</h3>
                        <p className="text-xs text-muted-foreground mb-3">Configure operational thresholds with industry-benchmark defaults.</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block font-medium">Cost Ceiling (monthly max)</label>
                          <Input
                            value={customization.costCeiling || (costProfile?.monthlyEstimate ? String(costProfile.monthlyEstimate) : "")}
                            onChange={(e) => setCustomization({ ...customization, costCeiling: e.target.value })}
                            placeholder={costProfile?.monthlyEstimate ? `$${costProfile.monthlyEstimate}` : "Enter monthly cost ceiling"}
                            data-testid="input-cost-ceiling"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block font-medium">Quality Floor (min KPI %)</label>
                          <Input
                            value={customization.qualityFloor || (displayTemplate?.avgKpiDelivery ? String(displayTemplate.avgKpiDelivery) : "")}
                            onChange={(e) => setCustomization({ ...customization, qualityFloor: e.target.value })}
                            placeholder={displayTemplate?.avgKpiDelivery ? `${displayTemplate.avgKpiDelivery}%` : "Enter minimum KPI %"}
                            data-testid="input-quality-floor"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block font-medium">Risk Tolerance</label>
                          <Input
                            value={customization.riskTolerance || (displayTemplate?.defaultRiskTier || "")}
                            onChange={(e) => setCustomization({ ...customization, riskTolerance: e.target.value })}
                            placeholder={displayTemplate?.defaultRiskTier || "MEDIUM"}
                            data-testid="input-risk-tolerance"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block font-medium">Max Latency (ms)</label>
                          <Input
                            value={customization.maxLatency}
                            onChange={(e) => setCustomization({ ...customization, maxLatency: e.target.value })}
                            placeholder="500"
                            data-testid="input-max-latency"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="flex flex-col gap-4" data-testid="wizard-step-3">
                      <div>
                        <h3 className="text-sm font-medium mb-1">Additional Skills</h3>
                        <p className="text-xs text-muted-foreground mb-3">Browse and add skills from the Skill Library, or type a custom skill name.</p>
                      </div>

                      {customization.additionalSkills.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {customization.additionalSkills.map((skill, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] gap-1">
                              {skill}
                              <button
                                onClick={() => {
                                  const updated = customization.additionalSkills.filter((_, i) => i !== idx);
                                  setCustomization({ ...customization, additionalSkills: updated });
                                }}
                                className="ml-0.5"
                                data-testid={`button-remove-skill-${idx}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 justify-start gap-2"
                          onClick={() => setSkillLibraryOpen(true)}
                          data-testid="button-open-skill-library"
                        >
                          <BookOpen className="w-4 h-4" />
                          Browse Skill Library
                        </Button>
                        <div className="flex items-center gap-1">
                          <Input
                            value={customization.newSkill}
                            onChange={(e) => setCustomization({ ...customization, newSkill: e.target.value })}
                            placeholder="Or type custom skill"
                            className="w-40"
                            data-testid="input-new-skill"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && customization.newSkill.trim()) {
                                e.preventDefault();
                                setCustomization({
                                  ...customization,
                                  additionalSkills: [...customization.additionalSkills, customization.newSkill.trim()],
                                  newSkill: "",
                                });
                              }
                            }}
                          />
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              if (customization.newSkill.trim()) {
                                setCustomization({
                                  ...customization,
                                  additionalSkills: [...customization.additionalSkills, customization.newSkill.trim()],
                                  newSkill: "",
                                });
                              }
                            }}
                            data-testid="button-add-skill"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {skillLibraryOpen && (
                        <Card data-testid="skill-library-picker">
                          <CardContent className="p-3 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                                <Input
                                  value={skillSearch}
                                  onChange={(e) => setSkillSearch(e.target.value)}
                                  placeholder="Search skills by name, domain, or tag..."
                                  className="flex-1"
                                  data-testid="input-skill-search"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setSkillLibraryOpen(false); setSkillSearch(""); }}
                                data-testid="button-close-skill-library"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5" data-testid="skill-library-list">
                              {!allSkills ? (
                                <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                  Loading skills...
                                </div>
                              ) : (() => {
                                const q = skillSearch.toLowerCase();
                                const filtered = allSkills.filter(s =>
                                  (s.name || "").toLowerCase().includes(q) ||
                                  (s.domain || "").toLowerCase().includes(q) ||
                                  (s.industry || "").toLowerCase().includes(q) ||
                                  (s.tags || []).some((t: string) => (t || "").toLowerCase().includes(q))
                                );
                                if (filtered.length === 0) {
                                  return (
                                    <div className="text-xs text-muted-foreground py-4 text-center">
                                      No skills match your search.
                                    </div>
                                  );
                                }
                                return filtered.map(skill => {
                                  const alreadyAdded = customization.additionalSkills.includes(skill.name);
                                  return (
                                    <div
                                      key={skill.id}
                                      className={`flex items-center gap-3 p-2.5 rounded-md border text-xs transition-colors ${alreadyAdded ? "border-green-500/30 bg-green-500/5" : "hover-elevate"}`}
                                      data-testid={`skill-library-item-${skill.id}`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium truncate">{skill.name}</div>
                                        <div className="text-muted-foreground truncate mt-0.5">{skill.description}</div>
                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                          {skill.domain && <Badge variant="outline" className="text-[9px]">{skill.domain}</Badge>}
                                          {skill.industry && <Badge variant="outline" className="text-[9px]">{skill.industry.replace(/_/g, " ")}</Badge>}
                                          {skill.complexity && <Badge variant="outline" className="text-[9px]">{skill.complexity}</Badge>}
                                        </div>
                                      </div>
                                      {alreadyAdded ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="shrink-0 text-green-600 dark:text-green-500"
                                          onClick={() => {
                                            setCustomization({
                                              ...customization,
                                              additionalSkills: customization.additionalSkills.filter(s => s !== skill.name),
                                            });
                                          }}
                                          data-testid={`button-remove-library-skill-${skill.id}`}
                                        >
                                          <CheckCircle2 className="w-4 h-4 mr-1" />
                                          Added
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="shrink-0"
                                          onClick={() => {
                                            setCustomization({
                                              ...customization,
                                              additionalSkills: [...customization.additionalSkills, skill.name],
                                            });
                                          }}
                                          data-testid={`button-add-library-skill-${skill.id}`}
                                        >
                                          <Plus className="w-3 h-3 mr-1" />
                                          Add
                                        </Button>
                                      )}
                                    </div>
                                  );
                                });
                              })()}
                            </div>

                            {allSkills && (
                              <div className="text-[10px] text-muted-foreground text-center pt-1 border-t">
                                {allSkills.length} skills available in the library
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}

                  {wizardStep === 4 && (
                    <div className="flex flex-col gap-4" data-testid="wizard-step-4">
                      <div>
                        <h3 className="text-sm font-medium mb-1">Review & Deploy</h3>
                        <p className="text-xs text-muted-foreground mb-3">Review your customizations and deploy the template.</p>
                      </div>

                      {/* Customization Summary */}
                      <Card>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customization Summary</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-muted-foreground font-medium">Data Sources: </span>
                              <span>{Object.keys(customization.dataSources).filter(k => customization.dataSources[k]).length} connected</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium">Cost Ceiling: </span>
                              <span>{customization.costCeiling || (costProfile?.monthlyEstimate ? `$${costProfile.monthlyEstimate}` : "Not set")}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium">Quality Floor: </span>
                              <span>{customization.qualityFloor || (displayTemplate?.avgKpiDelivery ? `${displayTemplate.avgKpiDelivery}%` : "Not set")}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium">Risk Tolerance: </span>
                              <span>{customization.riskTolerance || displayTemplate?.defaultRiskTier || "Not set"}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium">Max Latency: </span>
                              <span>{customization.maxLatency}ms</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground font-medium">Additional Skills: </span>
                              <span>{customization.additionalSkills.length} added</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Compliance Pre-Check */}
                      <Card>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Compliance Pre-Check</div>
                          <div className="flex flex-col gap-2">
                            {complianceChecks.map((check, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs" data-testid={`compliance-check-${idx}`}>
                                {check.pass ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-500 shrink-0" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                )}
                                <span className={`flex-1 ${check.pass ? "" : "text-muted-foreground"}`}>{check.label}</span>
                                {!check.pass && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1"
                                    onClick={() => handleFixCompliance(check.fixType)}
                                    data-testid={`button-fix-${check.fixType}`}
                                  >
                                    <Wrench className="w-3 h-3" />
                                    Fix Now
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                          {!allChecksPassed && (
                            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs" data-testid="compliance-warning">
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">Remediation Steps Required</span>
                                {complianceChecks.filter(c => !c.pass).map((check, idx) => (
                                  <span key={idx} className="text-muted-foreground">{check.remedy}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Deploy Button */}
                      <Button
                        className="w-full"
                        disabled={!allChecksPassed || deployMutation.isPending}
                        onClick={() => setDeployDialogOpen(true)}
                        data-testid="button-deploy-shadow"
                      >
                        {deployMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        ) : (
                          <Rocket className="w-4 h-4 mr-1.5" />
                        )}
                        {deployMutation.isPending ? "Deploying..." : "Deploy to Shadow Replay"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
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

      {/* Deploy Confirmation Dialog */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent data-testid="dialog-deploy-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" /> Deploy to Shadow Replay
            </DialogTitle>
            <DialogDescription>
              This template will be deployed to the shadow replay pipeline. The golden evaluation dataset will run automatically to validate performance before promotion to canary and production stages.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)} data-testid="button-cancel-deploy">
              Cancel
            </Button>
            <Button
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
              data-testid="button-confirm-deploy"
            >
              {deployMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4 mr-1.5" />
              )}
              {deployMutation.isPending ? "Deploying..." : "Confirm Deploy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Enhance Dialog */}
      <Dialog open={enhanceDialogOpen} onOpenChange={(open) => { setEnhanceDialogOpen(open); if (!open) setEnhancePreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-ai-enhance">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" /> AI Enhancement Preview
            </DialogTitle>
            <DialogDescription>
              Edit the AI-suggested improvements below, then click "Apply Changes" to update your template.
            </DialogDescription>
          </DialogHeader>
          {enhancePreview && (
            <div className="flex flex-col gap-4 py-2" data-testid="enhance-preview-content">
              {enhancePreview.description !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Description</h4>
                  <Textarea
                    value={enhancePreview.description || ""}
                    onChange={(e) => setEnhancePreview({ ...enhancePreview, description: e.target.value })}
                    rows={3}
                    className="text-sm"
                    data-testid="preview-description"
                  />
                </div>
              )}
              {enhancePreview.tools && Array.isArray(enhancePreview.tools) && enhancePreview.tools.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tools ({enhancePreview.tools.length})</h4>
                    <Button size="sm" variant="ghost" onClick={() => setEnhancePreview({ ...enhancePreview, tools: [...enhancePreview.tools, { name: "", description: "", permissions: [] }] })} data-testid="button-add-preview-tool">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {enhancePreview.tools.map((t: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <Wrench className="w-3.5 h-3.5 mt-2.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 flex flex-col gap-1">
                          <Input
                            value={t.name || ""}
                            onChange={(e) => { const tools = [...enhancePreview.tools]; tools[i] = { ...tools[i], name: e.target.value }; setEnhancePreview({ ...enhancePreview, tools }); }}
                            placeholder="Tool name"
                            className="text-sm"
                            data-testid={`preview-tool-name-${i}`}
                          />
                          <Input
                            value={t.description || ""}
                            onChange={(e) => { const tools = [...enhancePreview.tools]; tools[i] = { ...tools[i], description: e.target.value }; setEnhancePreview({ ...enhancePreview, tools }); }}
                            placeholder="Tool description"
                            className="text-sm"
                            data-testid={`preview-tool-desc-${i}`}
                          />
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => { const tools = enhancePreview.tools.filter((_: any, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, tools }); }} data-testid={`button-remove-preview-tool-${i}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {enhancePreview.workflowNodes && Array.isArray(enhancePreview.workflowNodes) && enhancePreview.workflowNodes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workflow ({enhancePreview.workflowNodes.length} nodes)</h4>
                    <Button size="sm" variant="ghost" onClick={() => setEnhancePreview({ ...enhancePreview, workflowNodes: [...enhancePreview.workflowNodes, { id: `step_${enhancePreview.workflowNodes.length + 1}`, type: "llm_call", label: "" }] })} data-testid="button-add-preview-workflow">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {enhancePreview.workflowNodes.map((n: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <Select value={n.type || "llm_call"} onValueChange={(val) => { const nodes = [...enhancePreview.workflowNodes]; nodes[i] = { ...nodes[i], type: val }; setEnhancePreview({ ...enhancePreview, workflowNodes: nodes }); }}>
                          <SelectTrigger className="w-[140px] text-xs" data-testid={`preview-workflow-type-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["schema_validate","rag","llm_call","classifier","router","tool_call","human_review","transform","output_format"].map(t => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={n.label || ""}
                          onChange={(e) => { const nodes = [...enhancePreview.workflowNodes]; nodes[i] = { ...nodes[i], label: e.target.value }; setEnhancePreview({ ...enhancePreview, workflowNodes: nodes }); }}
                          placeholder="Node label"
                          className="text-sm flex-1"
                          data-testid={`preview-workflow-label-${i}`}
                        />
                        <Button size="icon" variant="ghost" onClick={() => { const nodes = enhancePreview.workflowNodes.filter((_: any, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, workflowNodes: nodes }); }} data-testid={`button-remove-preview-workflow-${i}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const perms = enhancePreview.permissions || {};
                const dataAccess = perms.dataAccess || enhancePreview.dataAccess;
                const apiAccess = perms.apiAccess || enhancePreview.apiAccess;
                const writeAccess = perms.writeAccess || enhancePreview.writeAccess;
                if (!dataAccess && !apiAccess && !writeAccess) return null;
                const updatePerm = (field: string, val: string) => {
                  const updated = { ...enhancePreview };
                  if (updated.permissions) { updated.permissions = { ...updated.permissions, [field]: val }; }
                  else { updated[field] = val; }
                  setEnhancePreview(updated);
                };
                return (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Permissions</h4>
                    <div className="flex flex-col gap-1.5">
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Data Access</label>
                        <Input value={Array.isArray(dataAccess) ? dataAccess.join(", ") : (dataAccess || "")} onChange={(e) => updatePerm("dataAccess", e.target.value)} className="text-sm" data-testid="preview-data-access" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">API Access</label>
                        <Input value={Array.isArray(apiAccess) ? apiAccess.join(", ") : (apiAccess || "")} onChange={(e) => updatePerm("apiAccess", e.target.value)} className="text-sm" data-testid="preview-api-access" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Write Access</label>
                        <Input value={Array.isArray(writeAccess) ? writeAccess.join(", ") : (writeAccess || "")} onChange={(e) => updatePerm("writeAccess", e.target.value)} className="text-sm" data-testid="preview-write-access" />
                      </div>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const rag = enhancePreview.memoryRagConfig || enhancePreview.memoryRag;
                if (!rag) return null;
                const ragKey = enhancePreview.memoryRagConfig ? "memoryRagConfig" : "memoryRag";
                const updateRag = (field: string, val: any) => setEnhancePreview({ ...enhancePreview, [ragKey]: { ...rag, [field]: val } });
                return (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Memory / RAG</h4>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Vector Store</label>
                        <Input value={rag.vectorStore || ""} onChange={(e) => updateRag("vectorStore", e.target.value)} className="text-sm" data-testid="preview-vector-store" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Strategy</label>
                        <Input value={rag.retrievalStrategy || ""} onChange={(e) => updateRag("retrievalStrategy", e.target.value)} className="text-sm" data-testid="preview-retrieval-strategy" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Chunk Size</label>
                        <Input type="number" value={rag.chunkSize || 512} onChange={(e) => updateRag("chunkSize", parseInt(e.target.value) || 512)} className="text-sm" data-testid="preview-chunk-size" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Embedding Model</label>
                        <Input value={rag.embeddingModel || ""} onChange={(e) => updateRag("embeddingModel", e.target.value)} className="text-sm" data-testid="preview-embedding-model" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Top-K</label>
                        <Input type="number" value={rag.topK || 5} onChange={(e) => updateRag("topK", parseInt(e.target.value) || 5)} className="text-sm" data-testid="preview-top-k" />
                      </div>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const certs = enhancePreview.complianceCertifications;
                if (!certs || !Array.isArray(certs) || certs.length === 0) return null;
                return (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Compliance Certifications ({certs.length})</h4>
                      <Button size="sm" variant="ghost" onClick={() => { const cert = prompt("Enter certification name:"); if (cert) setEnhancePreview({ ...enhancePreview, complianceCertifications: [...certs, cert] }); }} data-testid="button-add-preview-cert">
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {certs.map((cert: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-[10px] gap-1 pr-1">
                          {cert}
                          <button onClick={() => { const updated = certs.filter((_: string, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, complianceCertifications: updated }); }} className="ml-0.5 rounded-full" data-testid={`button-remove-preview-cert-${i}`}>
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {enhancePreview.policyBindings && Array.isArray(enhancePreview.policyBindings) && enhancePreview.policyBindings.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Policy Bindings</h4>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {enhancePreview.policyBindings.map((p: any, i: number) => {
                      const matchedPolicy = (policyLibrary || []).find(
                        lib => (p.policyId && lib.id === p.policyId) || lib.name.toLowerCase() === (p.policyName || p.name || "").toLowerCase()
                      );
                      return (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`preview-policy-${i}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{p.policyName || p.name || "Unnamed Policy"}</span>
                              {(matchedPolicy?.domain || p.domain) && <Badge variant="outline" className="text-[9px]">{matchedPolicy?.domain || p.domain}</Badge>}
                              {!matchedPolicy && <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-600 dark:text-amber-400">Not in library</Badge>}
                            </div>
                            {(matchedPolicy?.description || p.description) && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{matchedPolicy?.description || p.description}</p>}
                          </div>
                          <Select value={p.enforcement || "soft"} onValueChange={(val) => { const bindings = [...enhancePreview.policyBindings]; bindings[i] = { ...bindings[i], enforcement: val }; setEnhancePreview({ ...enhancePreview, policyBindings: bindings }); }}>
                            <SelectTrigger className="w-[100px] text-xs" data-testid={`preview-policy-enforcement-${i}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hard">Hard</SelectItem>
                              <SelectItem value="soft">Soft</SelectItem>
                              <SelectItem value="advisory">Advisory</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="icon" variant="ghost" onClick={() => { const bindings = enhancePreview.policyBindings.filter((_: any, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, policyBindings: bindings }); }} data-testid={`button-remove-preview-policy-${i}`}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {enhancePreview.evalBindings && Array.isArray(enhancePreview.evalBindings) && enhancePreview.evalBindings.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Eval Bindings</h4>
                    <Button size="sm" variant="ghost" onClick={() => setEnhancePreview({ ...enhancePreview, evalBindings: [...enhancePreview.evalBindings, { suiteName: "", schedule: "on_deploy" }] })} data-testid="button-add-preview-eval">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {enhancePreview.evalBindings.map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={e.suiteName || e.name || ""} onChange={(ev) => { const bindings = [...enhancePreview.evalBindings]; bindings[i] = { ...bindings[i], suiteName: ev.target.value }; setEnhancePreview({ ...enhancePreview, evalBindings: bindings }); }} placeholder="Suite name" className="text-sm flex-1" data-testid={`preview-eval-name-${i}`} />
                        <Select value={e.schedule || "on_deploy"} onValueChange={(val) => { const bindings = [...enhancePreview.evalBindings]; bindings[i] = { ...bindings[i], schedule: val }; setEnhancePreview({ ...enhancePreview, evalBindings: bindings }); }}>
                          <SelectTrigger className="w-[110px] text-xs" data-testid={`preview-eval-schedule-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["on_deploy","daily","weekly","on_change","manual"].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="icon" variant="ghost" onClick={() => { const bindings = enhancePreview.evalBindings.filter((_: any, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, evalBindings: bindings }); }} data-testid={`button-remove-preview-eval-${i}`}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {enhancePreview.rollbackPlan && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Rollback Plan</h4>
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">Target Version</label>
                      <Input value={enhancePreview.rollbackPlan.rollbackTargetVersion || ""} onChange={(e) => setEnhancePreview({ ...enhancePreview, rollbackPlan: { ...enhancePreview.rollbackPlan, rollbackTargetVersion: e.target.value } })} className="text-sm" data-testid="preview-rollback-target" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-0.5 block">Trigger Conditions</label>
                      {Array.isArray(enhancePreview.rollbackPlan.triggerConditions) && enhancePreview.rollbackPlan.triggerConditions.map((c: string, i: number) => (
                        <div key={i} className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <Input value={c} onChange={(e) => { const conditions = [...enhancePreview.rollbackPlan.triggerConditions]; conditions[i] = e.target.value; setEnhancePreview({ ...enhancePreview, rollbackPlan: { ...enhancePreview.rollbackPlan, triggerConditions: conditions } }); }} className="text-sm flex-1" data-testid={`preview-rollback-condition-${i}`} />
                          <Button size="icon" variant="ghost" onClick={() => { const conditions = enhancePreview.rollbackPlan.triggerConditions.filter((_: string, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, rollbackPlan: { ...enhancePreview.rollbackPlan, triggerConditions: conditions } }); }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => setEnhancePreview({ ...enhancePreview, rollbackPlan: { ...enhancePreview.rollbackPlan, triggerConditions: [...(enhancePreview.rollbackPlan.triggerConditions || []), ""] } })} data-testid="button-add-rollback-condition">
                        <Plus className="w-3 h-3 mr-1" /> Add Condition
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {enhancePreview.preloadedSkills && Array.isArray(enhancePreview.preloadedSkills) && enhancePreview.preloadedSkills.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Pre-loaded Skills (from {industry?.label || "Industry"} Library)</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {enhancePreview.preloadedSkills.map((s: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px] gap-1 pr-1" data-testid={`badge-preview-skill-${i}`}>
                        <Zap className="w-2.5 h-2.5" />
                        {s.skillName}
                        {s.domain && <span className="text-muted-foreground ml-0.5">({s.domain})</span>}
                        <button onClick={() => { const skills = enhancePreview.preloadedSkills.filter((_: any, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, preloadedSkills: skills }); }} className="ml-0.5 rounded-full" data-testid={`button-remove-preview-skill-${i}`}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {enhancePreview.tags && Array.isArray(enhancePreview.tags) && enhancePreview.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {enhancePreview.tags.map((t: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px] gap-1 pr-1">
                        {t}
                        <button onClick={() => { const tags = enhancePreview.tags.filter((_: string, idx: number) => idx !== i); setEnhancePreview({ ...enhancePreview, tags }); }} className="ml-0.5 rounded-full" data-testid={`button-remove-preview-tag-${i}`}>
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => { const tag = prompt("Enter tag name:"); if (tag) setEnhancePreview({ ...enhancePreview, tags: [...enhancePreview.tags, tag] }); }} data-testid="button-add-preview-tag">
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              )}
              {(enhancePreview.complexity || enhancePreview.defaultRiskTier || enhancePreview.defaultAutonomyMode) && (
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Risk & Configuration</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {enhancePreview.complexity !== undefined && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Complexity</label>
                        <Select value={enhancePreview.complexity} onValueChange={(val) => setEnhancePreview({ ...enhancePreview, complexity: val })}>
                          <SelectTrigger className="text-xs" data-testid="preview-complexity">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["low","medium","high"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {enhancePreview.defaultRiskTier !== undefined && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Risk Tier</label>
                        <Select value={enhancePreview.defaultRiskTier} onValueChange={(val) => setEnhancePreview({ ...enhancePreview, defaultRiskTier: val })}>
                          <SelectTrigger className="text-xs" data-testid="preview-risk-tier">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["LOW","MEDIUM","HIGH","CRITICAL"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {enhancePreview.defaultAutonomyMode !== undefined && (
                      <div>
                        <label className="text-xs text-muted-foreground mb-0.5 block">Autonomy</label>
                        <Select value={enhancePreview.defaultAutonomyMode} onValueChange={(val) => setEnhancePreview({ ...enhancePreview, defaultAutonomyMode: val })}>
                          <SelectTrigger className="text-xs" data-testid="preview-autonomy">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["autonomous","assisted","supervised","manual"].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEnhanceDialogOpen(false); setEnhancePreview(null); }} data-testid="button-cancel-enhance">
              Cancel
            </Button>
            <Button onClick={applyEnhancement} data-testid="button-apply-enhance">
              <Wand2 className="w-4 h-4 mr-1.5" /> Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
