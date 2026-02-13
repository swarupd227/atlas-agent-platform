import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { Runbook } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Loader2,
  Search,
  ChevronRight,
  Zap,
  Shield,
  GitBranch,
  Filter,
  BookOpen,
  Clock,
  Trash2,
  Sparkles,
  Play,
  ArrowRight,
  X,
  AlertTriangle,
} from "lucide-react";

const INDUSTRY_FILTERS = [
  { key: "all", label: "All" },
  { key: "financial_services", label: "Financial" },
  { key: "healthcare", label: "Healthcare" },
  { key: "manufacturing", label: "Manufacturing" },
  { key: "insurance", label: "Insurance" },
  { key: "retail", label: "Retail" },
];

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "draft", label: "Draft" },
];

const CATEGORIES = [
  { value: "compliance", label: "Compliance" },
  { value: "risk_management", label: "Risk Management" },
  { value: "patient_safety", label: "Patient Safety" },
  { value: "clinical_quality", label: "Clinical Quality" },
  { value: "equipment_maintenance", label: "Equipment Maintenance" },
  { value: "quality_control", label: "Quality Control" },
  { value: "claims_management", label: "Claims Management" },
  { value: "pricing", label: "Pricing" },
  { value: "incident_response", label: "Incident Response" },
];

const AUTONOMY_LABELS: Record<string, string> = {
  full_auto: "Full Auto",
  log_only: "Log Only",
  notify_after: "Notify After",
  confirm_before: "Confirm Before",
  expert_approval: "Expert Approval",
};

const AUTONOMY_LEVELS = [
  { value: "full_auto", label: "Full Auto" },
  { value: "log_only", label: "Log Only" },
  { value: "notify_after", label: "Notify After" },
  { value: "confirm_before", label: "Confirm Before" },
  { value: "expert_approval", label: "Expert Approval" },
];

function getIndustryColor(ind: string) {
  switch (ind?.toLowerCase()) {
    case "financial_services": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "healthcare": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "manufacturing": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "insurance": return "bg-violet-500/15 text-violet-700 dark:text-violet-400";
    case "retail": return "bg-rose-500/15 text-rose-700 dark:text-rose-400";
    default: return "";
  }
}

function getSeverityVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  switch (s?.toLowerCase()) {
    case "critical": return "destructive";
    case "high": return "default";
    case "medium": return "secondary";
    default: return "outline";
  }
}

function getSeverityColor(s: string) {
  switch (s?.toLowerCase()) {
    case "critical": return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "high": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "medium": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "low": return "bg-green-500/15 text-green-700 dark:text-green-400";
    default: return "";
  }
}

function getStatusColor(s: string) {
  switch (s?.toLowerCase()) {
    case "active": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "draft": return "bg-gray-500/15 text-gray-700 dark:text-gray-400";
    default: return "";
  }
}

function getStepTypeIcon(type: string) {
  switch (type) {
    case "action": return <Zap className="w-4 h-4 text-blue-500" />;
    case "condition": return <GitBranch className="w-4 h-4 text-amber-500" />;
    case "approval_gate": return <Shield className="w-4 h-4 text-red-500" />;
    default: return <Zap className="w-4 h-4 text-muted-foreground" />;
  }
}

function getStepTypeBg(type: string) {
  switch (type) {
    case "action": return "bg-blue-500/10 border-blue-500/30";
    case "condition": return "bg-amber-500/10 border-amber-500/30";
    case "approval_gate": return "bg-red-500/10 border-red-500/30";
    default: return "";
  }
}

function getAutonomyColor(level: string) {
  switch (level) {
    case "full_auto": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "log_only": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "notify_after": return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    case "confirm_before": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "expert_approval": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "";
  }
}

function formatIndustry(ind: string) {
  return ind?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || ind;
}

function formatCategory(cat: string) {
  return cat?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || cat;
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

type Step = {
  id: string;
  type: string;
  action?: string;
  label: string;
  condition?: string;
  trueNext?: string;
  falseNext?: string;
  approvalLevel?: string;
  order: number;
};

type ApprovalGate = {
  stepId: string;
  requiredRole: string;
  autonomyLevel: string;
};

type TriggerCondition = {
  type: string;
  event?: string;
  metric?: string;
  operator?: string;
  threshold?: number;
};

export default function RunbookAutomation() {
  const { toast } = useToast();
  const { industry } = useIndustry();
  const industryId = industry?.id || "financial_services";

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailTab, setDetailTab] = useState("overview");

  const [createOpen, setCreateOpen] = useState(false);
  const [newRunbook, setNewRunbook] = useState({
    name: "",
    description: "",
    industry: industryId,
    category: "incident_response",
    triggerType: "manual",
    severity: "medium",
    autonomyLevel: "confirm_before",
    estimatedDuration: "",
  });

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStep, setNewStep] = useState<Partial<Step>>({
    type: "action",
    label: "",
    condition: "",
    trueNext: "",
    falseNext: "",
    approvalLevel: "confirm_before",
  });

  const [addTriggerOpen, setAddTriggerOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState<Partial<TriggerCondition>>({
    type: "event",
    event: "",
    metric: "",
    operator: "greater_than",
    threshold: 0,
  });

  const { data: runbooks = [], isLoading } = useQuery<Runbook[]>({
    queryKey: ["/api/runbooks"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/runbooks", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/runbooks"] });
      toast({ title: "Runbook created", description: created.name });
      setCreateOpen(false);
      setNewRunbook({ name: "", description: "", industry: industryId, category: "incident_response", triggerType: "manual", severity: "medium", autonomyLevel: "confirm_before", estimatedDuration: "" });
      setSelectedId(created.id);
    },
    onError: (e: any) => toast({ title: "Failed to create runbook", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/runbooks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runbooks"] });
      toast({ title: "Runbook updated" });
    },
    onError: (e: any) => toast({ title: "Failed to update runbook", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/runbooks/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runbooks"] });
      toast({ title: "Runbook deleted" });
      setSelectedId(null);
    },
    onError: (e: any) => toast({ title: "Failed to delete runbook", description: e.message, variant: "destructive" }),
  });

  const seedMutation = useMutation({
    mutationFn: async (ind: string) => {
      const res = await apiRequest("POST", "/api/runbooks/seed-prebuilt", { industry: ind });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/runbooks"] });
      toast({ title: "Pre-built runbooks loaded", description: `${result.seeded} runbook(s) added` });
    },
    onError: (e: any) => toast({ title: "Failed to load pre-built runbooks", description: e.message, variant: "destructive" }),
  });

  const aiGenerateMutation = useMutation({
    mutationFn: async (data: { industry: string; incidentType: string; description: string }) => {
      const res = await apiRequest("POST", "/api/ai/generate-runbook", data);
      return res.json();
    },
    onSuccess: (generated) => {
      setNewRunbook({
        name: generated.name || "",
        description: generated.description || "",
        industry: newRunbook.industry,
        category: generated.category || "incident_response",
        triggerType: generated.triggerType || "manual",
        severity: generated.severity || "medium",
        autonomyLevel: generated.autonomyLevel || "confirm_before",
        estimatedDuration: generated.estimatedDuration || "",
      });
      toast({ title: "AI runbook generated", description: "Form pre-filled with AI content" });
    },
    onError: (e: any) => toast({ title: "AI generation failed", description: e.message, variant: "destructive" }),
  });

  const aiEnhanceMutation = useMutation({
    mutationFn: async (data: { runbookId: string; runbook: any; enhanceMode: string }) => {
      const res = await apiRequest("POST", "/api/ai/enhance-runbook", { runbook: data.runbook, enhanceMode: data.enhanceMode });
      return res.json();
    },
    onSuccess: (enhanced, variables) => {
      const targetId = variables.runbookId;
      const mode = variables.enhanceMode;
      const updateData: any = {};

      if (mode === "full" || mode === "steps") {
        if (enhanced.steps?.length) updateData.steps = enhanced.steps;
      }
      if (mode === "full" || mode === "triggers") {
        if (enhanced.triggerConditions?.length) updateData.triggerConditions = enhanced.triggerConditions;
      }
      if (mode === "full" || mode === "approvals") {
        if (enhanced.approvalGates?.length) updateData.approvalGates = enhanced.approvalGates;
      }
      if (mode === "full") {
        if (enhanced.description) updateData.description = enhanced.description;
        if (enhanced.autonomyLevel) updateData.autonomyLevel = enhanced.autonomyLevel;
        if (enhanced.estimatedDuration) updateData.estimatedDuration = enhanced.estimatedDuration;
        if (enhanced.severity) updateData.severity = enhanced.severity;
      }

      if (Object.keys(updateData).length === 0) {
        toast({ title: "No changes", description: "AI did not suggest any enhancements for this mode" });
        return;
      }

      updateMutation.mutate({ id: targetId, data: updateData });
      toast({
        title: "AI enhancement applied",
        description: enhanced.enhancementSummary || `Runbook ${mode} enhanced successfully`,
      });
    },
    onError: (e: any) => toast({ title: "AI enhancement failed", description: e.message, variant: "destructive" }),
  });

  function handleAiEnhance(mode: string) {
    if (!selected) return;
    const targetId = selected.id;
    aiEnhanceMutation.mutate({
      runbookId: targetId,
      runbook: {
        name: selected.name,
        description: selected.description,
        industry: selected.industry,
        category: selected.category,
        severity: selected.severity,
        steps: selected.steps,
        triggerConditions: selected.triggerConditions,
        approvalGates: selected.approvalGates,
      },
      enhanceMode: mode,
    });
  }

  const filteredRunbooks = useMemo(() => {
    let list = runbooks;
    if (industryFilter !== "all") {
      list = list.filter((r) => r.industry === industryFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [runbooks, industryFilter, statusFilter, searchQuery]);

  const selected = useMemo(
    () => runbooks.find((r) => r.id === selectedId) || null,
    [runbooks, selectedId]
  );

  const selectedSteps = useMemo(() => {
    if (!selected) return [];
    return (Array.isArray(selected.steps) ? selected.steps : []) as Step[];
  }, [selected]);

  const selectedApprovalGates = useMemo(() => {
    if (!selected) return [];
    return (Array.isArray(selected.approvalGates) ? selected.approvalGates : []) as ApprovalGate[];
  }, [selected]);

  const selectedTriggers = useMemo(() => {
    if (!selected) return [];
    return (Array.isArray(selected.triggerConditions) ? selected.triggerConditions : []) as TriggerCondition[];
  }, [selected]);

  function handleCreate() {
    createMutation.mutate({
      name: newRunbook.name,
      description: newRunbook.description,
      industry: newRunbook.industry,
      category: newRunbook.category,
      triggerType: newRunbook.triggerType,
      severity: newRunbook.severity,
      autonomyLevel: newRunbook.autonomyLevel,
      estimatedDuration: newRunbook.estimatedDuration,
      triggerConditions: [],
      steps: [],
      approvalGates: [],
      status: "draft",
      isPreBuilt: false,
      triggerCount: 0,
    });
  }

  function handleToggleStatus() {
    if (!selected) return;
    const newStatus = selected.status === "active" ? "draft" : "active";
    updateMutation.mutate({ id: selected.id, data: { status: newStatus } });
  }

  function handleAddStep() {
    if (!selected || !newStep.label) return;
    const steps = [...selectedSteps];
    const step: Step = {
      id: String(steps.length + 1),
      type: newStep.type || "action",
      label: newStep.label || "",
      condition: newStep.type === "condition" ? newStep.condition : undefined,
      trueNext: newStep.type === "condition" ? newStep.trueNext : undefined,
      falseNext: newStep.type === "condition" ? newStep.falseNext : undefined,
      approvalLevel: newStep.type === "approval_gate" ? newStep.approvalLevel : undefined,
      order: steps.length + 1,
    };
    steps.push(step);
    updateMutation.mutate({ id: selected.id, data: { steps } });
    setAddStepOpen(false);
    setNewStep({ type: "action", label: "", condition: "", trueNext: "", falseNext: "", approvalLevel: "confirm_before" });
  }

  function handleRemoveStep(stepId: string) {
    if (!selected) return;
    const steps = selectedSteps.filter((s) => s.id !== stepId);
    updateMutation.mutate({ id: selected.id, data: { steps } });
  }

  function handleAddTrigger() {
    if (!selected) return;
    const triggers = [...selectedTriggers];
    const trigger: TriggerCondition = {
      type: newTrigger.type || "event",
      ...(newTrigger.type === "event" ? { event: newTrigger.event } : {}),
      ...(newTrigger.type === "metric" ? { metric: newTrigger.metric, operator: newTrigger.operator, threshold: newTrigger.threshold } : {}),
    };
    triggers.push(trigger);
    updateMutation.mutate({ id: selected.id, data: { triggerConditions: triggers } });
    setAddTriggerOpen(false);
    setNewTrigger({ type: "event", event: "", metric: "", operator: "greater_than", threshold: 0 });
  }

  function handleAiGenerate() {
    aiGenerateMutation.mutate({
      industry: newRunbook.industry,
      incidentType: newRunbook.category,
      description: newRunbook.description || "Generate an industry-specific runbook",
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4" data-testid="page-runbook-automation-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="flex gap-4">
          <div className="w-[300px] space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <div className="flex-1 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4" data-testid="page-runbook-automation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Industry Runbook Automation</h1>
          <p className="text-sm text-muted-foreground">Pre-built and custom automated response procedures for industry-specific incidents</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => seedMutation.mutate(industryId)}
            disabled={seedMutation.isPending}
            data-testid="button-load-prebuilt"
          >
            {seedMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <BookOpen className="w-4 h-4 mr-1" />}
            Load Pre-Built Runbooks
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpen(true)}
            data-testid="button-new-runbook"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Runbook
          </Button>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left Column */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search runbooks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-runbooks"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {INDUSTRY_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={industryFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setIndustryFilter(f.key)}
                className="toggle-elevate text-xs"
                data-testid={`button-filter-${f.key}`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={statusFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.key)}
                className="toggle-elevate text-xs"
                data-testid={`button-filter-status-${f.key}`}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <ScrollArea className="h-[calc(100vh-360px)]">
            <div className="space-y-2 pr-2">
              {filteredRunbooks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No runbooks found</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a new runbook or load pre-built ones</p>
                </div>
              )}
              {filteredRunbooks.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    setDetailTab("overview");
                  }}
                  className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                    selectedId === r.id ? "toggle-elevated border-blue-500/50" : ""
                  }`}
                  data-testid={`card-runbook-${r.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate block" data-testid={`text-runbook-name-${r.id}`}>{r.name}</span>
                    </div>
                    <ChevronRight className="w-3 h-3 text-muted-foreground mt-1" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <Badge variant="outline" className={`text-[10px] ${getIndustryColor(r.industry)}`} data-testid={`badge-industry-${r.id}`}>
                      {formatIndustry(r.industry)}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]" data-testid={`badge-category-${r.id}`}>
                      {formatCategory(r.category)}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getStatusColor(r.status)}`} data-testid={`badge-status-${r.id}`}>
                      {r.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge variant={getSeverityVariant(r.severity)} className={`text-[10px] ${getSeverityColor(r.severity)}`} data-testid={`badge-severity-${r.id}`}>
                      {r.severity}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{r.triggerType}</span>
                    <span className="text-[10px] text-muted-foreground">{r.triggerCount} triggers</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right Column */}
        <div className="flex-1 min-w-0">
          {!selected && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Select a runbook</p>
              <p className="text-sm text-muted-foreground mt-1">Choose from the left panel to view details</p>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold" data-testid="text-selected-runbook-name">{selected.name}</h2>
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAiEnhance("full")}
                  disabled={aiEnhanceMutation.isPending}
                  data-testid="button-ai-enhance-full"
                >
                  {aiEnhanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  AI Enhance
                </Button>
              </div>

              <Tabs value={detailTab} onValueChange={setDetailTab}>
                <TabsList>
                  <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="steps" data-testid="tab-steps">Steps</TabsTrigger>
                  <TabsTrigger value="approvals" data-testid="tab-approvals">Approval Gates</TabsTrigger>
                  <TabsTrigger value="triggers" data-testid="tab-triggers">Triggers</TabsTrigger>
                </TabsList>

                {/* Tab 1: Overview */}
                <TabsContent value="overview">
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Industry</Label>
                          <div className="mt-1">
                            <Badge variant="outline" className={getIndustryColor(selected.industry)} data-testid="text-overview-industry">
                              {formatIndustry(selected.industry)}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Category</Label>
                          <div className="mt-1">
                            <Badge variant="outline" data-testid="text-overview-category">
                              {formatCategory(selected.category)}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Trigger Type</Label>
                          <div className="mt-1 flex items-center gap-1">
                            {selected.triggerType === "automatic" ? <Zap className="w-3 h-3 text-amber-500" /> : <Play className="w-3 h-3 text-blue-500" />}
                            <span className="text-sm" data-testid="text-overview-trigger-type">{selected.triggerType}</span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Autonomy Level</Label>
                          <div className="mt-1">
                            <Badge variant="outline" className={getAutonomyColor(selected.autonomyLevel)} data-testid="text-overview-autonomy">
                              {AUTONOMY_LABELS[selected.autonomyLevel] || selected.autonomyLevel}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Estimated Duration</Label>
                          <div className="mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm" data-testid="text-overview-duration">{selected.estimatedDuration || "Not set"}</span>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Severity</Label>
                          <div className="mt-1">
                            <Badge variant={getSeverityVariant(selected.severity)} className={getSeverityColor(selected.severity)} data-testid="text-overview-severity">
                              {selected.severity}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Trigger Count</Label>
                          <span className="text-sm block mt-1" data-testid="text-overview-trigger-count">{selected.triggerCount}</span>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Triggered</Label>
                          <span className="text-sm block mt-1" data-testid="text-overview-last-triggered">
                            {selected.lastTriggered ? timeAgo(selected.lastTriggered as any) : "Never"}
                          </span>
                        </div>
                      </div>

                      <Separator />

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Status</Label>
                          <Badge
                            variant="outline"
                            className={getStatusColor(selected.status)}
                            data-testid="text-overview-status"
                          >
                            {selected.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleToggleStatus}
                            disabled={updateMutation.isPending}
                            data-testid="button-toggle-status"
                          >
                            {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                            {selected.status === "active" ? "Set to Draft" : "Activate"}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteMutation.mutate(selected.id)}
                            disabled={deleteMutation.isPending}
                            data-testid="button-delete-runbook"
                          >
                            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 2: Steps */}
                <TabsContent value="steps">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {selectedSteps.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Zap className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No steps defined</p>
                          <p className="text-xs text-muted-foreground mt-1">Add steps to build the runbook workflow</p>
                        </div>
                      )}
                      {selectedSteps.map((step, idx) => (
                        <div key={step.id}>
                          <div
                            className={`rounded-md border p-3 ${getStepTypeBg(step.type)}`}
                            data-testid={`card-step-${step.id}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium">
                                  {step.order}
                                </div>
                                {getStepTypeIcon(step.type)}
                                <div>
                                  <span className="text-sm font-medium" data-testid={`text-step-label-${step.id}`}>{step.label}</span>
                                  <Badge variant="outline" className="ml-2 text-[10px]">{step.type.replace("_", " ")}</Badge>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveStep(step.id)}
                                data-testid={`button-remove-step-${step.id}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>

                            {step.type === "condition" && (
                              <div className="mt-2 ml-8 space-y-1">
                                {step.condition && (
                                  <div className="text-xs text-muted-foreground">
                                    <span className="font-medium">IF:</span> {step.condition}
                                  </div>
                                )}
                                <div className="flex flex-wrap items-center gap-3">
                                  {step.trueNext && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400">THEN</Badge>
                                      <ArrowRight className="w-3 h-3" />
                                      <span>Step {step.trueNext}</span>
                                    </div>
                                  )}
                                  {step.falseNext && (
                                    <div className="flex items-center gap-1 text-xs">
                                      <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-400">ELSE</Badge>
                                      <ArrowRight className="w-3 h-3" />
                                      <span>Step {step.falseNext}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {step.type === "approval_gate" && step.approvalLevel && (
                              <div className="mt-2 ml-8 flex items-center gap-2">
                                <Shield className="w-3 h-3 text-red-500" />
                                <Badge variant="outline" className={`text-[10px] ${getAutonomyColor(step.approvalLevel)}`}>
                                  {AUTONOMY_LABELS[step.approvalLevel] || step.approvalLevel}
                                </Badge>
                              </div>
                            )}
                          </div>
                          {idx < selectedSteps.length - 1 && (
                            <div className="flex justify-center py-1">
                              <div className="w-px h-4 bg-border" />
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddStepOpen(true)}
                          className="flex-1"
                          data-testid="button-add-step"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Step
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAiEnhance("steps")}
                          disabled={aiEnhanceMutation.isPending}
                          data-testid="button-ai-generate-steps"
                        >
                          {aiEnhanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          AI Generate Steps
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 3: Approval Gates */}
                <TabsContent value="approvals">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {selectedApprovalGates.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Shield className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No approval gates configured</p>
                          <p className="text-xs text-muted-foreground mt-1">Add approval gate steps to require human oversight</p>
                        </div>
                      )}
                      {selectedApprovalGates.map((gate, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border p-3"
                          data-testid={`card-approval-gate-${idx}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-red-500" />
                              <div>
                                <span className="text-sm font-medium" data-testid={`text-gate-step-${idx}`}>Step: {gate.stepId}</span>
                                <span className="text-xs text-muted-foreground ml-2">Role: {gate.requiredRole}</span>
                              </div>
                            </div>
                            <Badge variant="outline" className={getAutonomyColor(gate.autonomyLevel)} data-testid={`badge-gate-autonomy-${idx}`}>
                              {AUTONOMY_LABELS[gate.autonomyLevel] || gate.autonomyLevel}
                            </Badge>
                          </div>
                        </div>
                      ))}

                      <Separator />

                      <div>
                        <Label className="text-xs text-muted-foreground">Autonomy Engine Integration</Label>
                        <div className="mt-2 space-y-2">
                          {AUTONOMY_LEVELS.map((level) => (
                            <div key={level.value} className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${
                                  level.value === "full_auto" ? "bg-green-500" :
                                  level.value === "log_only" ? "bg-blue-500" :
                                  level.value === "notify_after" ? "bg-amber-500" :
                                  level.value === "confirm_before" ? "bg-orange-500" :
                                  "bg-red-500"
                                }`} />
                                <span className="text-sm">{level.label}</span>
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${selected.autonomyLevel === level.value ? getAutonomyColor(level.value) : ""}`}
                                data-testid={`badge-autonomy-level-${level.value}`}
                              >
                                {selected.autonomyLevel === level.value ? "Current" : ""}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAiEnhance("approvals")}
                        disabled={aiEnhanceMutation.isPending}
                        className="w-full"
                        data-testid="button-ai-enhance-approvals"
                      >
                        {aiEnhanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                        AI Enhance Approval Gates
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 4: Triggers */}
                <TabsContent value="triggers">
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      {selectedTriggers.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <AlertTriangle className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No trigger conditions defined</p>
                          <p className="text-xs text-muted-foreground mt-1">Add triggers to automate runbook execution</p>
                        </div>
                      )}
                      {selectedTriggers.map((trigger, idx) => (
                        <div
                          key={idx}
                          className="rounded-md border p-3"
                          data-testid={`card-trigger-${idx}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px]" data-testid={`badge-trigger-type-${idx}`}>
                                {trigger.type}
                              </Badge>
                              {trigger.type === "event" && (
                                <span className="text-sm" data-testid={`text-trigger-event-${idx}`}>{trigger.event}</span>
                              )}
                              {trigger.type === "metric" && (
                                <span className="text-sm" data-testid={`text-trigger-metric-${idx}`}>
                                  {trigger.metric} {trigger.operator?.replace("_", " ")} {trigger.threshold}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAddTriggerOpen(true)}
                          className="flex-1"
                          data-testid="button-add-trigger"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add Trigger Condition
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAiEnhance("triggers")}
                          disabled={aiEnhanceMutation.isPending}
                          data-testid="button-ai-enhance-triggers"
                        >
                          {aiEnhanceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                          AI Suggest Triggers
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Create Runbook Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Runbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={newRunbook.name}
                onChange={(e) => setNewRunbook({ ...newRunbook, name: e.target.value })}
                placeholder="Runbook name"
                data-testid="input-runbook-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newRunbook.description}
                onChange={(e) => setNewRunbook({ ...newRunbook, description: e.target.value })}
                placeholder="Describe what this runbook does"
                data-testid="textarea-runbook-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Industry</Label>
                <Select value={newRunbook.industry} onValueChange={(v: any) => setNewRunbook({ ...newRunbook, industry: v })}>
                  <SelectTrigger data-testid="select-runbook-industry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="financial_services">Financial Services</SelectItem>
                    <SelectItem value="healthcare">Healthcare</SelectItem>
                    <SelectItem value="manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={newRunbook.category} onValueChange={(v) => setNewRunbook({ ...newRunbook, category: v })}>
                  <SelectTrigger data-testid="select-runbook-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trigger Type</Label>
                <Select value={newRunbook.triggerType} onValueChange={(v) => setNewRunbook({ ...newRunbook, triggerType: v })}>
                  <SelectTrigger data-testid="select-runbook-trigger-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic">Automatic</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={newRunbook.severity} onValueChange={(v) => setNewRunbook({ ...newRunbook, severity: v })}>
                  <SelectTrigger data-testid="select-runbook-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Autonomy Level</Label>
                <Select value={newRunbook.autonomyLevel} onValueChange={(v) => setNewRunbook({ ...newRunbook, autonomyLevel: v })}>
                  <SelectTrigger data-testid="select-runbook-autonomy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTONOMY_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Estimated Duration</Label>
                <Input
                  value={newRunbook.estimatedDuration}
                  onChange={(e) => setNewRunbook({ ...newRunbook, estimatedDuration: e.target.value })}
                  placeholder="e.g. 30 minutes"
                  data-testid="input-runbook-duration"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiGenerate}
              disabled={aiGenerateMutation.isPending}
              data-testid="button-ai-generate"
            >
              {aiGenerateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
              Generate with AI
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newRunbook.name}
              data-testid="button-create-runbook"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Runbook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Step Dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Step Type</Label>
              <Select value={newStep.type} onValueChange={(v) => setNewStep({ ...newStep, type: v })}>
                <SelectTrigger data-testid="select-step-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="action">Action</SelectItem>
                  <SelectItem value="condition">Condition</SelectItem>
                  <SelectItem value="approval_gate">Approval Gate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label</Label>
              <Input
                value={newStep.label}
                onChange={(e) => setNewStep({ ...newStep, label: e.target.value })}
                placeholder="Step description"
                data-testid="input-step-label"
              />
            </div>
            {newStep.type === "condition" && (
              <>
                <div>
                  <Label>Condition</Label>
                  <Input
                    value={newStep.condition}
                    onChange={(e) => setNewStep({ ...newStep, condition: e.target.value })}
                    placeholder="e.g. error_rate > 5%"
                    data-testid="input-step-condition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>True Next (Step ID)</Label>
                    <Input
                      value={newStep.trueNext}
                      onChange={(e) => setNewStep({ ...newStep, trueNext: e.target.value })}
                      placeholder="Step ID"
                      data-testid="input-step-true-next"
                    />
                  </div>
                  <div>
                    <Label>False Next (Step ID)</Label>
                    <Input
                      value={newStep.falseNext}
                      onChange={(e) => setNewStep({ ...newStep, falseNext: e.target.value })}
                      placeholder="Step ID"
                      data-testid="input-step-false-next"
                    />
                  </div>
                </div>
              </>
            )}
            {newStep.type === "approval_gate" && (
              <div>
                <Label>Approval Level</Label>
                <Select value={newStep.approvalLevel} onValueChange={(v) => setNewStep({ ...newStep, approvalLevel: v })}>
                  <SelectTrigger data-testid="select-step-approval-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTONOMY_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleAddStep}
              disabled={!newStep.label || updateMutation.isPending}
              data-testid="button-submit-step"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Trigger Dialog */}
      <Dialog open={addTriggerOpen} onOpenChange={setAddTriggerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Trigger Condition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Trigger Type</Label>
              <Select value={newTrigger.type} onValueChange={(v) => setNewTrigger({ ...newTrigger, type: v })}>
                <SelectTrigger data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="metric">Metric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newTrigger.type === "event" && (
              <div>
                <Label>Event Name</Label>
                <Input
                  value={newTrigger.event}
                  onChange={(e) => setNewTrigger({ ...newTrigger, event: e.target.value })}
                  placeholder="e.g. compliance_violation"
                  data-testid="input-trigger-event"
                />
              </div>
            )}
            {newTrigger.type === "metric" && (
              <>
                <div>
                  <Label>Metric Name</Label>
                  <Input
                    value={newTrigger.metric}
                    onChange={(e) => setNewTrigger({ ...newTrigger, metric: e.target.value })}
                    placeholder="e.g. error_rate"
                    data-testid="input-trigger-metric"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Operator</Label>
                    <Select value={newTrigger.operator} onValueChange={(v) => setNewTrigger({ ...newTrigger, operator: v })}>
                      <SelectTrigger data-testid="select-trigger-operator">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="greater_than">Greater Than</SelectItem>
                        <SelectItem value="less_than">Less Than</SelectItem>
                        <SelectItem value="equals">Equals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Threshold</Label>
                    <Input
                      type="number"
                      value={newTrigger.threshold}
                      onChange={(e) => setNewTrigger({ ...newTrigger, threshold: Number(e.target.value) })}
                      data-testid="input-trigger-threshold"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleAddTrigger}
              disabled={updateMutation.isPending}
              data-testid="button-submit-trigger"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Add Trigger
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
