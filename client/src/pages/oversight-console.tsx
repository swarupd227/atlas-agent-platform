import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useIndustry } from "@/components/industry-provider";
import {
  Shield,
  AlertTriangle,
  Clock,
  Brain,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowUp,
  ArrowRight,
  Sparkles,
  Eye,
  Lock,
  UserCheck,
  Bell,
  Scale,
  FileText,
  TrendingUp,
  Search,
  Filter,
  BarChart3,
  Zap,
  Target,
  Gauge,
  ChevronRight,
  Info,
  MessageSquare,
  BookOpen,
  GitBranch,
  Plus,
} from "lucide-react";

type OversightDecision = {
  id: string;
  agentId: string | null;
  agentName: string;
  actionType: string;
  actionDescription: string;
  industry: string;
  status: string;
  priority: string;
  compositeRiskScore: number;
  confidence: number;
  reasoningChain: any[];
  industryContext: any;
  regulatoryPolicies: any[];
  ontologyRefs: any[];
  similarDecisions: any[];
  riskDimensions: any;
  requestedAction: any;
  resolution: string | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  precedentRule: any | null;
  createdAt: string;
};

function getRiskColor(score: number) {
  if (score < 30) return "text-green-600 dark:text-green-400";
  if (score < 60) return "text-yellow-600 dark:text-yellow-400";
  if (score < 80) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function getRiskBgColor(score: number) {
  if (score < 30) return "bg-green-500/15 text-green-600 dark:text-green-400";
  if (score < 60) return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400";
  if (score < 80) return "bg-orange-500/15 text-orange-600 dark:text-orange-400";
  return "bg-red-500/15 text-red-600 dark:text-red-400";
}

function getRiskBarColor(score: number) {
  if (score < 30) return "bg-green-500";
  if (score < 60) return "bg-yellow-500";
  if (score < 80) return "bg-orange-500";
  return "bg-red-500";
}

function getRiskLabel(score: number) {
  if (score < 30) return "Low";
  if (score < 60) return "Medium";
  if (score < 80) return "High";
  return "Critical";
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

function getPriorityVariant(priority: string): "default" | "secondary" | "destructive" | "outline" {
  switch (priority?.toLowerCase()) {
    case "critical": return "destructive";
    case "high": return "default";
    case "medium": return "secondary";
    default: return "outline";
  }
}

function getResolutionIcon(resolution: string | null) {
  switch (resolution) {
    case "approved": return <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case "rejected": return <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case "modified": return <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case "escalated": return <ArrowUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case "approved_teach": return <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    case "approved_precedent": return <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    default: return <Info className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function OversightConsole() {
  const { toast } = useToast();
  const { industry } = useIndustry();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("context");
  const [actionDialog, setActionDialog] = useState<{ open: boolean; action: string; label: string }>({ open: false, action: "", label: "" });
  const [actionNote, setActionNote] = useState("");
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [generateCount, setGenerateCount] = useState(3);
  const [newDecision, setNewDecision] = useState({
    agentName: "",
    actionType: "",
    actionDescription: "",
    priority: "medium",
    compositeRiskScore: 50,
    confidence: 0.7,
  });

  const { data: decisions = [], isLoading } = useQuery<OversightDecision[]>({
    queryKey: ["/api/oversight-decisions"],
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/oversight-decisions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oversight-decisions"] });
      toast({ title: "Decision resolved" });
      setActionDialog({ open: false, action: "", label: "" });
      setActionNote("");
    },
    onError: (e: any) => toast({ title: "Failed to resolve", description: e.message, variant: "destructive" }),
  });

  const aiMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/ai/oversight-context", data);
      return res.json();
    },
    onSuccess: (data) => {
      setAiAnalysis(data);
      toast({ title: "AI analysis complete" });
    },
    onError: (e: any) => toast({ title: "AI analysis failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/oversight-decisions", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/oversight-decisions"] });
      toast({ title: "Decision created", description: `${created.agentName} - ${created.actionType}` });
      setCreateDialogOpen(false);
      setNewDecision({ agentName: "", actionType: "", actionDescription: "", priority: "medium", compositeRiskScore: 50, confidence: 0.7 });
      setSelectedId(created.id);
    },
    onError: (e: any) => toast({ title: "Failed to create", description: e.message, variant: "destructive" }),
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { industry: string; count: number }) => {
      const res = await apiRequest("POST", "/api/ai/generate-oversight-decisions", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/oversight-decisions"] });
      toast({ title: "Decisions generated", description: `${data.count} new decisions added to the queue` });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  function handleCreateDecision() {
    createMutation.mutate({
      ...newDecision,
      industry: industry?.id || "financial_services",
      status: "pending",
      reasoningChain: [],
      industryContext: {},
      regulatoryPolicies: [],
      ontologyRefs: [],
      similarDecisions: [],
      riskDimensions: {},
      requestedAction: {},
    });
  }

  function handleGenerateDecisions() {
    generateMutation.mutate({
      industry: industry?.id || "financial_services",
      count: generateCount,
    });
  }

  const filteredDecisions = useMemo(() => {
    let list = decisions;
    if (statusFilter === "pending") list = list.filter((d) => d.status === "pending");
    else if (statusFilter === "resolved") list = list.filter((d) => d.status === "resolved");
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.agentName.toLowerCase().includes(q) ||
          d.actionType.toLowerCase().includes(q) ||
          d.actionDescription.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => b.compositeRiskScore - a.compositeRiskScore);
  }, [decisions, statusFilter, searchQuery]);

  const selectedDecision = useMemo(
    () => decisions.find((d) => d.id === selectedId) || null,
    [decisions, selectedId]
  );

  const pendingCount = decisions.filter((d) => d.status === "pending").length;
  const avgRisk = decisions.length > 0 ? Math.round(decisions.reduce((s, d) => s + d.compositeRiskScore, 0) / decisions.length) : 0;
  const todayCount = decisions.filter((d) => {
    const created = new Date(d.createdAt);
    const today = new Date();
    return created.toDateString() === today.toDateString();
  }).length;

  function handleAction(action: string, label: string) {
    if (action === "modified") {
      setActionDialog({ open: true, action, label });
    } else {
      setActionDialog({ open: true, action, label });
    }
  }

  function handleConfirmAction() {
    if (!selectedDecision) return;
    const data: any = {
      resolution: actionDialog.action,
      resolutionNote: actionNote || null,
      resolvedBy: "Expert Reviewer",
      resolvedAt: new Date().toISOString(),
      status: "resolved",
    };
    if (actionDialog.action === "approved_precedent") {
      data.precedentRule = {
        actionType: selectedDecision.actionType,
        condition: `Auto-approve ${selectedDecision.actionType} when risk score < ${selectedDecision.compositeRiskScore}`,
        level: "auto_approve",
        createdFrom: selectedDecision.id,
      };
    }
    resolveMutation.mutate({ id: selectedDecision.id, data });
  }

  function handleGetAiAnalysis() {
    if (!selectedDecision) return;
    setAiAnalysis(null);
    aiMutation.mutate({
      decisionId: selectedDecision.id,
      actionType: selectedDecision.actionType,
      actionDescription: selectedDecision.actionDescription,
      industry: selectedDecision.industry,
      riskScore: selectedDecision.compositeRiskScore,
      regulatoryPolicies: selectedDecision.regulatoryPolicies,
      reasoningChain: selectedDecision.reasoningChain,
      industryContext: selectedDecision.industryContext,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Live Oversight Console</h1>
          <Badge variant="outline" className="gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Real-time
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            data-testid="button-new-decision"
          >
            <Plus className="w-4 h-4 mr-1" />
            New Decision
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateDecisions}
            disabled={generateMutation.isPending}
            data-testid="button-ai-generate-decisions"
          >
            {generateMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            AI Generate
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            data-testid="button-filter-all"
            className="toggle-elevate"
          >
            All
          </Button>
          <Button
            variant={statusFilter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("pending")}
            data-testid="button-filter-pending"
            className="toggle-elevate"
          >
            Pending
          </Button>
          <Button
            variant={statusFilter === "resolved" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("resolved")}
            data-testid="button-filter-resolved"
            className="toggle-elevate"
          >
            Resolved
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Risk Score</CardTitle>
            <Gauge className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRiskColor(avgRisk)}`} data-testid="text-avg-risk">{avgRisk}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Today</CardTitle>
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-today-count">{todayCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search decisions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-decisions"
            />
          </div>
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-2 pr-2">
              {filteredDecisions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="w-8 h-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No pending decisions. All caught up!</p>
                </div>
              )}
              {filteredDecisions.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelectedId(d.id);
                    setAiAnalysis(null);
                    setActiveTab("context");
                  }}
                  className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                    selectedId === d.id ? "toggle-elevated border-primary" : ""
                  }`}
                  data-testid={`card-decision-${d.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium truncate">{d.agentName}</span>
                        {d.status === "resolved" && (
                          <Badge variant="secondary" className="text-[10px]">Resolved</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.actionType}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-lg font-bold ${getRiskColor(d.compositeRiskScore)}`}
                        data-testid={`text-risk-score-${d.id}`}
                      >
                        {d.compositeRiskScore}
                      </span>
                      <Badge variant={getPriorityVariant(d.priority)} className="text-[10px]">
                        {d.priority}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{d.actionDescription}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(d.createdAt)}
                    </span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="col-span-9">
          {!selectedDecision ? (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-320px)] text-center">
              <Scale className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Select a decision to review</p>
              <p className="text-sm text-muted-foreground mt-1">Choose a decision from the queue to see full context</p>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedDecision.status === "resolved" && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {getResolutionIcon(selectedDecision.resolution)}
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">Resolution</span>
                            <Badge variant="secondary">{selectedDecision.resolution}</Badge>
                          </div>
                          {selectedDecision.resolutionNote && (
                            <p className="text-xs text-muted-foreground mt-1">{selectedDecision.resolutionNote}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          by {selectedDecision.resolvedBy}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedDecision.resolvedAt ? timeAgo(selectedDecision.resolvedAt) : ""}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="context" data-testid="tab-context">Context</TabsTrigger>
                  <TabsTrigger value="risk" data-testid="tab-risk">Risk Analysis</TabsTrigger>
                  <TabsTrigger value="regulatory" data-testid="tab-regulatory">Regulatory</TabsTrigger>
                  <TabsTrigger value="similar" data-testid="tab-similar">Similar Decisions</TabsTrigger>
                  <TabsTrigger value="ai" data-testid="tab-ai">AI Analysis</TabsTrigger>
                </TabsList>

                <TabsContent value="context" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Agent Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Agent</p>
                          <p className="text-sm font-medium" data-testid="text-agent-name">{selectedDecision.agentName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Action Type</p>
                          <p className="text-sm font-medium" data-testid="text-action-type">{selectedDecision.actionType}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                          <p className="text-sm font-medium" data-testid="text-confidence">{Math.round(selectedDecision.confidence * 100)}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        What the agent wants to do
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm" data-testid="text-action-description">{selectedDecision.actionDescription}</p>
                    </CardContent>
                  </Card>

                  {selectedDecision.reasoningChain && selectedDecision.reasoningChain.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Brain className="w-4 h-4" />
                          Reasoning Chain
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {selectedDecision.reasoningChain.map((step: any, i: number) => (
                            <div key={i} className="flex items-start gap-3">
                              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                {i + 1}
                              </span>
                              <p className="text-sm" data-testid={`text-reasoning-step-${i}`}>
                                {typeof step === "string" ? step : step.action ? `${step.action}${step.result ? ` → ${step.result}` : ""}` : step.description || JSON.stringify(step)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {selectedDecision.industryContext && Object.keys(selectedDecision.industryContext).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Target className="w-4 h-4" />
                          Industry Context
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(selectedDecision.industryContext).map(([key, value]) => (
                            <div key={key}>
                              <p className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</p>
                              <p className="text-sm font-medium" data-testid={`text-context-${key}`}>
                                {typeof value === "object" ? JSON.stringify(value) : String(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {selectedDecision.ontologyRefs && selectedDecision.ontologyRefs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        Ontology:
                      </span>
                      {selectedDecision.ontologyRefs.map((ref: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs" data-testid={`badge-ontology-${i}`}>
                          {typeof ref === "string" ? ref : ref.name || ref.label || JSON.stringify(ref)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="risk" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col items-center">
                          <span className={`text-5xl font-bold ${getRiskColor(selectedDecision.compositeRiskScore)}`} data-testid="text-risk-gauge">
                            {selectedDecision.compositeRiskScore}
                          </span>
                          <span className="text-sm text-muted-foreground mt-1">Composite Risk Score</span>
                        </div>
                        <Badge className={`${getRiskBgColor(selectedDecision.compositeRiskScore)} text-sm`} data-testid="badge-risk-level">
                          {getRiskLabel(selectedDecision.compositeRiskScore)} Risk
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {selectedDecision.riskDimensions && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Risk Dimensions</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(Array.isArray(selectedDecision.riskDimensions)
                          ? selectedDecision.riskDimensions
                          : Object.entries(selectedDecision.riskDimensions).map(([key, val]: [string, any]) => ({
                              name: key.replace(/_/g, " "),
                              score: typeof val === "number" ? val : val?.score || 0,
                              explanation: typeof val === "object" ? val?.explanation || "" : "",
                            }))
                        ).map((dim: any, i: number) => (
                          <div key={i} className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-medium capitalize">{dim.name || dim.dimension}</span>
                              <span className={`text-sm font-bold ${getRiskColor(dim.score)}`} data-testid={`text-dim-score-${i}`}>
                                {dim.score}
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getRiskBarColor(dim.score)}`}
                                style={{ width: `${Math.min(dim.score, 100)}%` }}
                              />
                            </div>
                            {dim.explanation && (
                              <p className="text-xs text-muted-foreground">{dim.explanation}</p>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="regulatory" className="space-y-4 mt-4">
                  {selectedDecision.regulatoryPolicies && selectedDecision.regulatoryPolicies.length > 0 ? (
                    <div className="space-y-3">
                      {selectedDecision.regulatoryPolicies.map((pol: any, i: number) => (
                        <Card key={i}>
                          <CardContent className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Shield className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium" data-testid={`text-regulation-${i}`}>
                                    {pol.regulation || pol.name}
                                  </span>
                                </div>
                                {pol.relevance && (
                                  <p className="text-xs text-muted-foreground">{pol.relevance}</p>
                                )}
                                {pol.requirement && (
                                  <p className="text-sm mt-1">{pol.requirement}</p>
                                )}
                              </div>
                              {pol.complianceRisk && (
                                <Badge className={`${getRiskBgColor(
                                  pol.complianceRisk === "critical" ? 90 :
                                  pol.complianceRisk === "high" ? 75 :
                                  pol.complianceRisk === "medium" ? 50 : 20
                                )}`} data-testid={`badge-compliance-risk-${i}`}>
                                  {pol.complianceRisk}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Shield className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No regulatory policies found for this decision</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="similar" className="space-y-4 mt-4">
                  {selectedDecision.similarDecisions && selectedDecision.similarDecisions.length > 0 ? (
                    <div className="space-y-3">
                      {selectedDecision.similarDecisions.map((sim: any, i: number) => (
                        <Card key={i}>
                          <CardContent className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {getResolutionIcon(sim.outcome)}
                                  <span className="text-sm font-medium" data-testid={`text-similar-outcome-${i}`}>
                                    {sim.outcome || "unknown"}
                                  </span>
                                  {sim.similarity && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {Math.round(sim.similarity * 100)}% match
                                    </Badge>
                                  )}
                                </div>
                                {sim.result && (
                                  <p className="text-sm">{sim.result}</p>
                                )}
                              </div>
                              {sim.timeAgo && (
                                <span className="text-xs text-muted-foreground">{sim.timeAgo}</span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No similar decisions found</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="ai" className="space-y-4 mt-4">
                  {!aiAnalysis && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Brain className="w-8 h-8 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground mb-4">Request AI-powered analysis of this decision</p>
                      <Button
                        onClick={handleGetAiAnalysis}
                        disabled={aiMutation.isPending}
                        data-testid="button-ai-analysis"
                      >
                        {aiMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Sparkles className="w-4 h-4 mr-2" />
                        )}
                        Get AI Analysis
                      </Button>
                    </div>
                  )}

                  {aiAnalysis && (
                    <div className="space-y-4">
                      {aiAnalysis.recommendation && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              AI Recommendation
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">Recommended Action</p>
                                <p className="text-sm font-medium" data-testid="text-ai-action">
                                  {aiAnalysis.recommendation.action || aiAnalysis.recommendation.recommended_action}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Confidence</p>
                                <p className="text-sm font-medium" data-testid="text-ai-confidence">
                                  {typeof aiAnalysis.recommendation.confidence === "number"
                                    ? `${Math.round(aiAnalysis.recommendation.confidence * 100)}%`
                                    : aiAnalysis.recommendation.confidence}
                                </p>
                              </div>
                            </div>
                            {aiAnalysis.recommendation.reasoning && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Reasoning</p>
                                <p className="text-sm" data-testid="text-ai-reasoning">{aiAnalysis.recommendation.reasoning}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {aiAnalysis.riskAnalysis && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Risk Analysis
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm" data-testid="text-ai-risk">
                              {typeof aiAnalysis.riskAnalysis === "string"
                                ? aiAnalysis.riskAnalysis
                                : JSON.stringify(aiAnalysis.riskAnalysis)}
                            </p>
                          </CardContent>
                        </Card>
                      )}

                      {aiAnalysis.regulatoryContext && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Regulatory Context
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm" data-testid="text-ai-regulatory">
                              {typeof aiAnalysis.regulatoryContext === "string"
                                ? aiAnalysis.regulatoryContext
                                : JSON.stringify(aiAnalysis.regulatoryContext)}
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {selectedDecision.status === "pending" && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        onClick={() => handleAction("approved", "Approve")}
                        className="bg-green-600 text-white"
                        data-testid="button-approve"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleAction("rejected", "Reject")}
                        data-testid="button-reject"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleAction("modified", "Modify & Approve")}
                        data-testid="button-modify-approve"
                      >
                        <GitBranch className="w-4 h-4 mr-1" />
                        Modify & Approve
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleAction("escalated", "Escalate")}
                        data-testid="button-escalate"
                      >
                        <ArrowUp className="w-4 h-4 mr-1" />
                        Escalate
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleAction("approved_teach", "Approve & Teach")}
                        data-testid="button-approve-teach"
                      >
                        <Sparkles className="w-4 h-4 mr-1" />
                        Approve & Teach
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleAction("approved_precedent", "Approve & Set Precedent")}
                        data-testid="button-approve-precedent"
                      >
                        <Scale className="w-4 h-4 mr-1" />
                        Approve & Set Precedent
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog open={actionDialog.open} onOpenChange={(open) => {
        if (!open) {
          setActionDialog({ open: false, action: "", label: "" });
          setActionNote("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="action-note">Note (optional)</Label>
              <Textarea
                id="action-note"
                placeholder="Add a note about this decision..."
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                data-testid="input-action-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionDialog({ open: false, action: "", label: "" });
                setActionNote("");
              }}
              data-testid="button-cancel-action"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={resolveMutation.isPending}
              data-testid="button-confirm-action"
            >
              {resolveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Oversight Decision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-agent-name">Agent Name</Label>
              <Input
                id="create-agent-name"
                placeholder="e.g. Transaction Monitor Agent"
                value={newDecision.agentName}
                onChange={(e) => setNewDecision({ ...newDecision, agentName: e.target.value })}
                data-testid="input-create-agent-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-action-type">Action Type</Label>
              <Input
                id="create-action-type"
                placeholder="e.g. Block Transaction, Halt Production"
                value={newDecision.actionType}
                onChange={(e) => setNewDecision({ ...newDecision, actionType: e.target.value })}
                data-testid="input-create-action-type"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                placeholder="Describe what the agent wants to do and why it needs oversight..."
                value={newDecision.actionDescription}
                onChange={(e) => setNewDecision({ ...newDecision, actionDescription: e.target.value })}
                data-testid="input-create-description"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={newDecision.priority}
                  onValueChange={(v) => setNewDecision({ ...newDecision, priority: v })}
                >
                  <SelectTrigger data-testid="select-create-priority">
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
              <div className="space-y-1.5">
                <Label>Risk Score</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={newDecision.compositeRiskScore}
                  onChange={(e) => setNewDecision({ ...newDecision, compositeRiskScore: Number(e.target.value) })}
                  data-testid="input-create-risk-score"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confidence</Label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={newDecision.confidence}
                  onChange={(e) => setNewDecision({ ...newDecision, confidence: Number(e.target.value) })}
                  data-testid="input-create-confidence"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateDecision}
              disabled={createMutation.isPending || !newDecision.agentName || !newDecision.actionType || !newDecision.actionDescription}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Create Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
