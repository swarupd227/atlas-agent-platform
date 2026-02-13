import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIndustry } from "@/components/industry-provider";
import type { ShadowTrace, ShadowReplaySession } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  Play,
  Plus,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeftRight,
  Shield,
  FileText,
  Clock,
  Filter,
  Search,
  ChevronRight,
  GitCompare,
  BarChart3,
  Target,
  Layers,
} from "lucide-react";

function getComplexityVariant(c: string): "default" | "secondary" | "destructive" | "outline" {
  switch (c?.toLowerCase()) {
    case "extreme": return "destructive";
    case "high": return "default";
    case "medium": return "secondary";
    default: return "outline";
  }
}

function getComplexityColor(c: string) {
  switch (c?.toLowerCase()) {
    case "low": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "medium": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "high": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "extreme": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "";
  }
}

function getRiskColor(r: string) {
  switch (r?.toLowerCase()) {
    case "low": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "medium": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "high": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "critical": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "";
  }
}

function getEdgeCaseColor(e: string) {
  switch (e?.toLowerCase()) {
    case "common": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "uncommon": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "rare": return "bg-orange-500/15 text-orange-700 dark:text-orange-400";
    case "novel": return "bg-red-500/15 text-red-700 dark:text-red-400";
    default: return "";
  }
}

function getStatusColor(s: string) {
  switch (s?.toLowerCase()) {
    case "configured": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "running": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    case "completed": return "bg-green-500/15 text-green-700 dark:text-green-400";
    default: return "";
  }
}

function getVerdictColor(v: string) {
  switch (v?.toLowerCase()) {
    case "equivalent": return "bg-green-500/15 text-green-700 dark:text-green-400";
    case "improved": return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
    case "regressed": return "bg-red-500/15 text-red-700 dark:text-red-400";
    case "different_but_acceptable": return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
    default: return "";
  }
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

function JsonViewer({ data }: { data: any }) {
  return (
    <pre className="text-xs font-mono p-3 rounded-md bg-muted/50 overflow-auto max-h-[400px] whitespace-pre-wrap">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function ShadowReplayStudio() {
  const { toast } = useToast();
  const { industry } = useIndustry();

  const [leftTab, setLeftTab] = useState<"traces" | "sessions">("traces");
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [complexityFilter, setComplexityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [traceDetailTab, setTraceDetailTab] = useState("input");
  const [sessionDetailTab, setSessionDetailTab] = useState("overview");

  const [createTraceOpen, setCreateTraceOpen] = useState(false);
  const [newTrace, setNewTrace] = useState({
    agentName: "",
    agentVersion: "1.0.0",
    scenarioCategory: "",
    scenarioComplexity: "medium",
    edgeCaseFrequency: "rare",
    riskLevel: "medium",
  });

  const [createSessionOpen, setCreateSessionOpen] = useState(false);
  const [newSession, setNewSession] = useState({
    name: "",
    candidateAgentVersion: "",
    baselineAgentVersion: "",
    criteria: {
      regulatoryCompliance: true,
      ontologyConsistency: true,
      accuracyScoring: true,
      safetyAssessment: true,
    },
    selectedTraceIds: [] as string[],
  });

  const { data: traces = [], isLoading: tracesLoading } = useQuery<ShadowTrace[]>({
    queryKey: ["/api/shadow-traces"],
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<ShadowReplaySession[]>({
    queryKey: ["/api/shadow-replay-sessions"],
  });

  const createTraceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/shadow-traces", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-traces"] });
      toast({ title: "Trace created", description: `${created.agentName} - ${created.scenarioCategory}` });
      setCreateTraceOpen(false);
      setNewTrace({ agentName: "", agentVersion: "1.0.0", scenarioCategory: "", scenarioComplexity: "medium", edgeCaseFrequency: "rare", riskLevel: "medium" });
      setSelectedTraceId(created.id);
    },
    onError: (e: any) => toast({ title: "Failed to create trace", description: e.message, variant: "destructive" }),
  });

  const generateTracesMutation = useMutation({
    mutationFn: async (data: { industry: string; count: number }) => {
      const res = await apiRequest("POST", "/api/ai/generate-shadow-traces", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-traces"] });
      toast({ title: "Traces generated", description: `${data.count || "New"} shadow traces added` });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const deleteTraceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shadow-traces/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-traces"] });
      toast({ title: "Trace deleted" });
      setSelectedTraceId(null);
    },
    onError: (e: any) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const createSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/shadow-replay-sessions", data);
      return res.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-replay-sessions"] });
      toast({ title: "Replay session created", description: created.name });
      setCreateSessionOpen(false);
      setNewSession({ name: "", candidateAgentVersion: "", baselineAgentVersion: "", criteria: { regulatoryCompliance: true, ontologyConsistency: true, accuracyScoring: true, safetyAssessment: true }, selectedTraceIds: [] });
      setLeftTab("sessions");
      setSelectedSessionId(created.id);
      setSelectedTraceId(null);
    },
    onError: (e: any) => toast({ title: "Failed to create session", description: e.message, variant: "destructive" }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shadow-replay-sessions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-replay-sessions"] });
      toast({ title: "Session deleted" });
      setSelectedSessionId(null);
    },
    onError: (e: any) => toast({ title: "Failed to delete", description: e.message, variant: "destructive" }),
  });

  const runAnalysisMutation = useMutation({
    mutationFn: async (data: { sessionId: string; industry: string }) => {
      const res = await apiRequest("POST", "/api/ai/shadow-replay-analyze", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shadow-replay-sessions"] });
      toast({ title: "Analysis complete" });
    },
    onError: (e: any) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const filteredTraces = useMemo(() => {
    let list = traces;
    if (complexityFilter !== "all") {
      list = list.filter((t) => t.scenarioComplexity === complexityFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.agentName.toLowerCase().includes(q) ||
          t.scenarioCategory.toLowerCase().includes(q)
      );
    }
    return list;
  }, [traces, complexityFilter, searchQuery]);

  const selectedTrace = useMemo(
    () => traces.find((t) => t.id === selectedTraceId) || null,
    [traces, selectedTraceId]
  );

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  function handleCreateTrace() {
    createTraceMutation.mutate({
      ...newTrace,
      industry: industry?.id || "financial_services",
      traceInput: {},
      traceOutput: {},
      traceMetadata: {},
      regulatoryContext: [],
      status: "captured",
      tags: [],
    });
  }

  function handleCreateSession() {
    createSessionMutation.mutate({
      name: newSession.name,
      industry: industry?.id || "financial_services",
      candidateAgentVersion: newSession.candidateAgentVersion,
      baselineAgentVersion: newSession.baselineAgentVersion,
      traceIds: newSession.selectedTraceIds,
      status: "configured",
      comparisonCriteria: newSession.criteria,
      replayResults: [],
      semanticDiff: {},
      complianceResults: [],
      aggregateScores: {},
      totalTraces: newSession.selectedTraceIds.length,
      passedTraces: 0,
      failedTraces: 0,
      regressionCount: 0,
    });
  }

  function handleRunAnalysis(sessionId: string) {
    runAnalysisMutation.mutate({
      sessionId,
      industry: industry?.id || "financial_services",
    });
  }

  const isLoading = tracesLoading || sessionsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const complexityFilters = ["all", "low", "medium", "high", "extreme"];

  return (
    <div className="space-y-4 p-4" data-testid="page-shadow-replay">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Shadow Replay Studio</h1>
          <p className="text-sm text-muted-foreground">Zero-risk agent deployment through production trace replay</p>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
        {/* Left Column */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3">
          <Tabs value={leftTab} onValueChange={(v) => { setLeftTab(v as any); if (v === "traces") { setSelectedSessionId(null); } else { setSelectedTraceId(null); } }}>
            <TabsList className="w-full">
              <TabsTrigger value="traces" className="flex-1" data-testid="tab-traces">
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                Traces
              </TabsTrigger>
              <TabsTrigger value="sessions" className="flex-1" data-testid="tab-sessions">
                <GitCompare className="w-3.5 h-3.5 mr-1.5" />
                Sessions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="traces" className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateTraceOpen(true)}
                  data-testid="button-new-trace"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Trace
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateTracesMutation.mutate({ industry: industry?.id || "financial_services", count: 3 })}
                  disabled={generateTracesMutation.isPending}
                  data-testid="button-ai-generate-traces"
                >
                  {generateTracesMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  AI Generate
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search traces..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-traces"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
                {complexityFilters.map((f) => (
                  <Button
                    key={f}
                    variant={complexityFilter === f ? "default" : "outline"}
                    size="sm"
                    onClick={() => setComplexityFilter(f)}
                    className="toggle-elevate text-xs capitalize"
                    data-testid={`button-filter-${f}`}
                  >
                    {f === "all" ? "All" : f}
                  </Button>
                ))}
              </div>

              <ScrollArea className="h-[calc(100vh-380px)]">
                <div className="space-y-2 pr-2">
                  {filteredTraces.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Layers className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No traces found</p>
                      <p className="text-xs text-muted-foreground mt-1">Create or generate shadow traces to get started</p>
                    </div>
                  )}
                  {filteredTraces.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTraceId(t.id);
                        setSelectedSessionId(null);
                        setTraceDetailTab("input");
                      }}
                      className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                        selectedTraceId === t.id ? "toggle-elevated border-blue-500/50" : ""
                      }`}
                      data-testid={`card-trace-${t.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium truncate block">{t.agentName}</span>
                          <span className="text-xs text-muted-foreground">v{t.agentVersion}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground mt-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{t.scenarioCategory}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-2">
                        <Badge variant="outline" className={`text-[10px] ${getComplexityColor(t.scenarioComplexity)}`}>
                          {t.scenarioComplexity}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${getRiskColor(t.riskLevel)}`}>
                          {t.riskLevel}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${getEdgeCaseColor(t.edgeCaseFrequency)}`}>
                          {t.edgeCaseFrequency}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {t.capturedAt ? timeAgo(t.capturedAt as any) : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="sessions" className="mt-3 space-y-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateSessionOpen(true)}
                data-testid="button-new-replay"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Replay
              </Button>

              <ScrollArea className="h-[calc(100vh-300px)]">
                <div className="space-y-2 pr-2">
                  {sessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <GitCompare className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No replay sessions</p>
                      <p className="text-xs text-muted-foreground mt-1">Create a replay session to compare agent versions</p>
                    </div>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => {
                        setSelectedSessionId(s.id);
                        setSelectedTraceId(null);
                        setSessionDetailTab("overview");
                      }}
                      className={`rounded-md border p-3 cursor-pointer hover-elevate toggle-elevate ${
                        selectedSessionId === s.id ? "toggle-elevated border-blue-500/50" : ""
                      }`}
                      data-testid={`card-session-${s.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        <Badge variant="outline" className={`text-[10px] ${getStatusColor(s.status)}`}>
                          {s.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                        <span>v{s.baselineAgentVersion}</span>
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>v{s.candidateAgentVersion}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <span className="text-[10px] text-muted-foreground">
                          {s.passedTraces}/{s.totalTraces} passed
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {s.createdAt ? timeAgo(s.createdAt as any) : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column */}
        <div className="flex-1 min-w-0">
          {!selectedTrace && !selectedSession && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Play className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-lg font-medium text-muted-foreground">Select a trace or session</p>
              <p className="text-sm text-muted-foreground mt-1">Choose from the left panel to view details</p>
            </div>
          )}

          {/* Trace Detail View */}
          {selectedTrace && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" data-testid="text-trace-name">{selectedTrace.agentName}</h2>
                  <p className="text-sm text-muted-foreground">
                    v{selectedTrace.agentVersion} - {selectedTrace.scenarioCategory}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${getComplexityColor(selectedTrace.scenarioComplexity)}`}>
                    {selectedTrace.scenarioComplexity}
                  </Badge>
                  <Badge variant="outline" className={`${getRiskColor(selectedTrace.riskLevel)}`}>
                    {selectedTrace.riskLevel} risk
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteTraceMutation.mutate(selectedTrace.id)}
                    disabled={deleteTraceMutation.isPending}
                    data-testid="button-delete-trace"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>

              <Tabs value={traceDetailTab} onValueChange={setTraceDetailTab}>
                <TabsList>
                  <TabsTrigger value="input" data-testid="tab-trace-input">
                    <FileText className="w-3.5 h-3.5 mr-1.5" />
                    Input
                  </TabsTrigger>
                  <TabsTrigger value="output" data-testid="tab-trace-output">
                    <Target className="w-3.5 h-3.5 mr-1.5" />
                    Output
                  </TabsTrigger>
                  <TabsTrigger value="metadata" data-testid="tab-trace-metadata">
                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                    Metadata
                  </TabsTrigger>
                  <TabsTrigger value="regulatory" data-testid="tab-trace-regulatory">
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    Regulatory
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="input" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Trace Input</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <JsonViewer data={selectedTrace.traceInput} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="output" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Trace Output</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <JsonViewer data={selectedTrace.traceOutput} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="metadata" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Trace Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1 p-3 rounded-md border">
                          <span className="text-xs text-muted-foreground">Duration</span>
                          <span className="text-lg font-semibold" data-testid="text-trace-duration">
                            {selectedTrace.duration != null ? `${selectedTrace.duration.toFixed(1)}ms` : "N/A"}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 p-3 rounded-md border">
                          <span className="text-xs text-muted-foreground">Token Count</span>
                          <span className="text-lg font-semibold" data-testid="text-trace-tokens">
                            {selectedTrace.tokenCount ?? "N/A"}
                          </span>
                        </div>
                      </div>
                      <JsonViewer data={selectedTrace.traceMetadata} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="regulatory" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Regulatory Context</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {Array.isArray(selectedTrace.regulatoryContext) && (selectedTrace.regulatoryContext as any[]).length > 0 ? (
                        <div className="space-y-2">
                          {(selectedTrace.regulatoryContext as any[]).map((item: any, idx: number) => (
                            <div key={idx} className="p-3 rounded-md border" data-testid={`regulatory-item-${idx}`}>
                              {typeof item === "string" ? (
                                <p className="text-sm">{item}</p>
                              ) : (
                                <div className="space-y-1">
                                  {item.name && <p className="text-sm font-medium">{item.name}</p>}
                                  {item.regulation && <p className="text-sm font-medium">{item.regulation}</p>}
                                  {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                  {item.requirement && <p className="text-xs text-muted-foreground">{item.requirement}</p>}
                                  {!item.name && !item.regulation && <JsonViewer data={item} />}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No regulatory context available</p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}

          {/* Session Detail View */}
          {selectedSession && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" data-testid="text-session-name">{selectedSession.name}</h2>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span>v{selectedSession.baselineAgentVersion}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>v{selectedSession.candidateAgentVersion}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${getStatusColor(selectedSession.status)}`}>
                    {selectedSession.status}
                  </Badge>
                  {selectedSession.status === "configured" && (
                    <Button
                      size="sm"
                      onClick={() => handleRunAnalysis(selectedSession.id)}
                      disabled={runAnalysisMutation.isPending}
                      data-testid="button-run-analysis"
                    >
                      {runAnalysisMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 mr-1" />
                      )}
                      Run Replay Analysis
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteSessionMutation.mutate(selectedSession.id)}
                    disabled={deleteSessionMutation.isPending}
                    data-testid="button-delete-session"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>

              {selectedSession.status === "running" && (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Replay analysis in progress...</p>
                  </CardContent>
                </Card>
              )}

              {selectedSession.status !== "running" && (
                <Tabs value={sessionDetailTab} onValueChange={setSessionDetailTab}>
                  <TabsList>
                    <TabsTrigger value="overview" data-testid="tab-session-overview">Overview</TabsTrigger>
                    <TabsTrigger value="semantic-diff" data-testid="tab-session-diff">Semantic Diff</TabsTrigger>
                    <TabsTrigger value="replay-results" data-testid="tab-session-results">Replay Results</TabsTrigger>
                    <TabsTrigger value="compliance" data-testid="tab-session-compliance">Compliance</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm font-medium">Session Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="flex flex-col gap-1 p-3 rounded-md border">
                            <span className="text-xs text-muted-foreground">Total Traces</span>
                            <span className="text-lg font-semibold" data-testid="text-total-traces">{selectedSession.totalTraces}</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 rounded-md border">
                            <span className="text-xs text-muted-foreground">Passed</span>
                            <span className="text-lg font-semibold text-green-700 dark:text-green-400" data-testid="text-passed-traces">{selectedSession.passedTraces}</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 rounded-md border">
                            <span className="text-xs text-muted-foreground">Failed</span>
                            <span className="text-lg font-semibold text-red-700 dark:text-red-400" data-testid="text-failed-traces">{selectedSession.failedTraces}</span>
                          </div>
                          <div className="flex flex-col gap-1 p-3 rounded-md border">
                            <span className="text-xs text-muted-foreground">Regressions</span>
                            <span className="text-lg font-semibold text-orange-700 dark:text-orange-400" data-testid="text-regression-count">{selectedSession.regressionCount}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {(() => {
                      const scores = selectedSession.aggregateScores as any;
                      if (!scores || typeof scores !== "object" || Object.keys(scores).length === 0) return null;
                      return (
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                          <CardTitle className="text-sm font-medium">Aggregate Scores</CardTitle>
                          {scores.recommendation && (
                            <Badge variant="outline" className={
                              scores.recommendation === "safe_to_deploy"
                                ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                : scores.recommendation === "needs_review"
                                  ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400"
                                  : "bg-red-500/15 text-red-700 dark:text-red-400"
                            } data-testid="badge-recommendation">
                              {scores.recommendation}
                            </Badge>
                          )}
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {scores.overallScore != null && (
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-24">Overall Score</span>
                              <div className="flex-1 h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-blue-500"
                                  style={{ width: `${Math.min(100, scores.overallScore * 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium w-12 text-right" data-testid="text-overall-score">
                                {(scores.overallScore * 100).toFixed(0)}%
                              </span>
                            </div>
                          )}
                          {scores.dimensions && typeof scores.dimensions === "object" && (
                            Object.entries(scores.dimensions as Record<string, number>).map(([key, val]) => (
                              <div key={key} className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground w-24 capitalize">{key.replace(/_/g, " ")}</span>
                                <div className="flex-1 h-2 rounded-full bg-muted">
                                  <div
                                    className={`h-2 rounded-full ${
                                      (typeof val === "number" ? val : 0) >= 0.8 ? "bg-green-500" :
                                      (typeof val === "number" ? val : 0) >= 0.6 ? "bg-yellow-500" :
                                      "bg-red-500"
                                    }`}
                                    style={{ width: `${Math.min(100, (typeof val === "number" ? val : 0) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium w-12 text-right">
                                  {((typeof val === "number" ? val : 0) * 100).toFixed(0)}%
                                </span>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>
                      );
                    })()}
                  </TabsContent>

                  <TabsContent value="semantic-diff" className="mt-4 space-y-4">
                    {(() => {
                      const diff = selectedSession.semanticDiff as any;
                      const hasDiff = diff && typeof diff === "object" && Object.keys(diff).length > 0;
                      if (!hasDiff) {
                        return (
                          <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12">
                              <ArrowLeftRight className="w-8 h-8 text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">No semantic diff data available</p>
                              {selectedSession.status === "configured" && (
                                <p className="text-xs text-muted-foreground mt-1">Run the replay analysis to generate diff data</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      }
                      return (
                        <>
                          {diff.overallSimilarity != null && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm font-medium">Overall Similarity</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 h-3 rounded-full bg-muted">
                                    <div
                                      className="h-3 rounded-full bg-blue-500"
                                      style={{ width: `${Math.min(100, diff.overallSimilarity * 100)}%` }}
                                    />
                                  </div>
                                  <span className="text-lg font-bold" data-testid="text-similarity-score">
                                    {(diff.overallSimilarity * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {Array.isArray(diff.behaviorChanges) && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm font-medium">Behavior Changes</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2">
                                  {(diff.behaviorChanges as any[]).map((change: any, idx: number) => (
                                    <div
                                      key={idx}
                                      className={`p-3 rounded-md border ${
                                        change.type === "regression" ? "border-red-500/30 bg-red-500/5" :
                                        change.type === "improvement" ? "border-green-500/30 bg-green-500/5" :
                                        ""
                                      }`}
                                      data-testid={`behavior-change-${idx}`}
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        {change.type === "regression" ? (
                                          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                        ) : change.type === "improvement" ? (
                                          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                                        ) : (
                                          <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                                        )}
                                        <span className="text-sm font-medium">{change.description || change.category || "Change"}</span>
                                        {change.type && (
                                          <Badge variant="outline" className={`text-[10px] ${
                                            change.type === "regression" ? "bg-red-500/15 text-red-700 dark:text-red-400" :
                                            change.type === "improvement" ? "bg-green-500/15 text-green-700 dark:text-green-400" :
                                            ""
                                          }`}>
                                            {change.type}
                                          </Badge>
                                        )}
                                      </div>
                                      {change.detail && <p className="text-xs text-muted-foreground mt-1">{change.detail}</p>}
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          {!Array.isArray(diff.behaviorChanges) && diff.overallSimilarity == null && (
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-sm font-medium">Semantic Diff Data</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <JsonViewer data={diff} />
                              </CardContent>
                            </Card>
                          )}
                        </>
                      );
                    })()}
                  </TabsContent>

                  <TabsContent value="replay-results" className="mt-4 space-y-4">
                    {Array.isArray(selectedSession.replayResults) && (selectedSession.replayResults as any[]).length > 0 ? (
                      <div className="space-y-2">
                        {(selectedSession.replayResults as any[]).map((result: any, idx: number) => (
                          <Card key={idx}>
                            <CardContent className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">Trace {result.traceId ? `#${(result.traceId as string).slice(0, 8)}` : idx + 1}</span>
                                    <Badge variant="outline" className={`text-[10px] ${getVerdictColor(result.verdict)}`} data-testid={`badge-verdict-${idx}`}>
                                      {result.verdict ? result.verdict.replace(/_/g, " ") : "unknown"}
                                    </Badge>
                                  </div>
                                  {result.explanation && (
                                    <p className="text-xs text-muted-foreground mt-1">{result.explanation}</p>
                                  )}
                                </div>
                              </div>
                              {result.rubricScores && typeof result.rubricScores === "object" && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                                  {Object.entries(result.rubricScores).map(([key, value]: [string, any]) => (
                                    <div key={key} className="flex flex-col gap-0.5">
                                      <span className="text-[10px] text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                      <div className="flex items-center gap-1.5">
                                        <div className="flex-1 h-1.5 rounded-full bg-muted">
                                          <div
                                            className={`h-1.5 rounded-full ${
                                              (typeof value === "number" ? value : 0) >= 0.8 ? "bg-green-500" :
                                              (typeof value === "number" ? value : 0) >= 0.6 ? "bg-yellow-500" :
                                              "bg-red-500"
                                            }`}
                                            style={{ width: `${Math.min(100, (typeof value === "number" ? value : 0) * 100)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-medium">
                                          {((typeof value === "number" ? value : 0) * 100).toFixed(0)}%
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <BarChart3 className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No replay results yet</p>
                          {selectedSession.status === "configured" && (
                            <p className="text-xs text-muted-foreground mt-1">Run the replay analysis to generate results</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  <TabsContent value="compliance" className="mt-4 space-y-4">
                    {Array.isArray(selectedSession.complianceResults) && (selectedSession.complianceResults as any[]).length > 0 ? (
                      <div className="space-y-2">
                        {(selectedSession.complianceResults as any[]).map((cr: any, idx: number) => (
                          <Card key={idx}>
                            <CardContent className="p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <Shield className="w-4 h-4 text-muted-foreground" />
                                  <span className="text-sm font-medium" data-testid={`compliance-regulation-${idx}`}>
                                    {cr.regulation || cr.name || `Regulation ${idx + 1}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {cr.tracesChecked != null && (
                                    <span className="text-xs text-muted-foreground">{cr.tracesChecked} checked</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-3 mt-2">
                                {cr.passed != null && (
                                  <div className="flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                    <span className="text-xs text-green-700 dark:text-green-400">{cr.passed} passed</span>
                                  </div>
                                )}
                                {cr.failed != null && (
                                  <div className="flex items-center gap-1">
                                    <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                                    <span className="text-xs text-red-700 dark:text-red-400">{cr.failed} failed</span>
                                  </div>
                                )}
                              </div>
                              {Array.isArray(cr.evidence) && cr.evidence.length > 0 && (
                                <div className="mt-3 space-y-1">
                                  <span className="text-[10px] text-muted-foreground font-medium">Evidence</span>
                                  {cr.evidence.map((ev: any, eidx: number) => (
                                    <div key={eidx} className="text-xs text-muted-foreground p-2 rounded-md bg-muted/50">
                                      {typeof ev === "string" ? ev : JSON.stringify(ev)}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <Shield className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">No compliance results yet</p>
                          {selectedSession.status === "configured" && (
                            <p className="text-xs text-muted-foreground mt-1">Run the replay analysis to generate compliance data</p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Trace Dialog */}
      <Dialog open={createTraceOpen} onOpenChange={setCreateTraceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Shadow Trace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Agent Name</Label>
              <Input
                value={newTrace.agentName}
                onChange={(e) => setNewTrace({ ...newTrace, agentName: e.target.value })}
                placeholder="e.g. Claims Processor"
                data-testid="input-trace-agent-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Agent Version</Label>
              <Input
                value={newTrace.agentVersion}
                onChange={(e) => setNewTrace({ ...newTrace, agentVersion: e.target.value })}
                placeholder="e.g. 2.1.0"
                data-testid="input-trace-agent-version"
              />
            </div>
            <div className="space-y-2">
              <Label>Scenario Category</Label>
              <Input
                value={newTrace.scenarioCategory}
                onChange={(e) => setNewTrace({ ...newTrace, scenarioCategory: e.target.value })}
                placeholder="e.g. High-value transaction"
                data-testid="input-trace-scenario"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Complexity</Label>
                <Select value={newTrace.scenarioComplexity} onValueChange={(v) => setNewTrace({ ...newTrace, scenarioComplexity: v })}>
                  <SelectTrigger data-testid="select-trace-complexity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="extreme">Extreme</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Edge Case</Label>
                <Select value={newTrace.edgeCaseFrequency} onValueChange={(v) => setNewTrace({ ...newTrace, edgeCaseFrequency: v })}>
                  <SelectTrigger data-testid="select-trace-edge-case">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="common">Common</SelectItem>
                    <SelectItem value="uncommon">Uncommon</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="novel">Novel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <Select value={newTrace.riskLevel} onValueChange={(v) => setNewTrace({ ...newTrace, riskLevel: v })}>
                  <SelectTrigger data-testid="select-trace-risk">
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateTraceOpen(false)} data-testid="button-cancel-trace">Cancel</Button>
            <Button
              onClick={handleCreateTrace}
              disabled={!newTrace.agentName || !newTrace.scenarioCategory || createTraceMutation.isPending}
              data-testid="button-submit-trace"
            >
              {createTraceMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Create Trace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Replay Session Dialog */}
      <Dialog open={createSessionOpen} onOpenChange={setCreateSessionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Replay Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Session Name</Label>
              <Input
                value={newSession.name}
                onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
                placeholder="e.g. v2.1 vs v2.0 regression test"
                data-testid="input-session-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Candidate Version</Label>
                <Input
                  value={newSession.candidateAgentVersion}
                  onChange={(e) => setNewSession({ ...newSession, candidateAgentVersion: e.target.value })}
                  placeholder="e.g. 2.1.0"
                  data-testid="input-candidate-version"
                />
              </div>
              <div className="space-y-2">
                <Label>Baseline Version</Label>
                <Input
                  value={newSession.baselineAgentVersion}
                  onChange={(e) => setNewSession({ ...newSession, baselineAgentVersion: e.target.value })}
                  placeholder="e.g. 2.0.0"
                  data-testid="input-baseline-version"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Comparison Criteria</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "regulatoryCompliance", label: "Regulatory Compliance" },
                  { key: "ontologyConsistency", label: "Ontology Consistency" },
                  { key: "accuracyScoring", label: "Accuracy Scoring" },
                  { key: "safetyAssessment", label: "Safety Assessment" },
                ].map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <Checkbox
                      checked={(newSession.criteria as any)[c.key]}
                      onCheckedChange={(checked) =>
                        setNewSession({
                          ...newSession,
                          criteria: { ...newSession.criteria, [c.key]: !!checked },
                        })
                      }
                      data-testid={`checkbox-criteria-${c.key}`}
                    />
                    <span className="text-sm">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Select Traces ({newSession.selectedTraceIds.length} selected)</Label>
              <ScrollArea className="h-40 rounded-md border p-2">
                <div className="space-y-1">
                  {traces.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No traces available. Create some first.</p>
                  )}
                  {traces.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                    >
                      <Checkbox
                        checked={newSession.selectedTraceIds.includes(t.id)}
                        onCheckedChange={(checked) => {
                          setNewSession({
                            ...newSession,
                            selectedTraceIds: checked
                              ? [...newSession.selectedTraceIds, t.id]
                              : newSession.selectedTraceIds.filter((id) => id !== t.id),
                          });
                        }}
                        data-testid={`checkbox-trace-${t.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium truncate block">{t.agentName}</span>
                        <span className="text-[10px] text-muted-foreground">{t.scenarioCategory}</span>
                      </div>
                      <Badge variant="outline" className={`text-[9px] ${getComplexityColor(t.scenarioComplexity)}`}>
                        {t.scenarioComplexity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSessionOpen(false)} data-testid="button-cancel-session">Cancel</Button>
            <Button
              onClick={handleCreateSession}
              disabled={!newSession.name || !newSession.candidateAgentVersion || !newSession.baselineAgentVersion || newSession.selectedTraceIds.length === 0 || createSessionMutation.isPending}
              data-testid="button-submit-session"
            >
              {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <GitCompare className="w-4 h-4 mr-1" />}
              Create Replay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
