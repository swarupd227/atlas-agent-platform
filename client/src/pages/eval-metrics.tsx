import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EvalMetric, Agent } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  FlaskConical,
  Search,
  ListChecks,
  Bot,
  ArrowLeft,
  Shield,
  Zap,
  Brain,
  MessageSquare,
  FileText,
  Tag,
  Gauge,
  Link2,
  Copy,
  Settings,
  CheckCircle,
  ChevronRight,
  X,
  Loader2,
  BarChart3,
} from "lucide-react";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "rag", label: "RAG" },
  { value: "agent", label: "Agent" },
  { value: "conversational", label: "Conversational" },
  { value: "safety", label: "Safety" },
  { value: "summarization", label: "Summarization" },
  { value: "custom", label: "Custom" },
  { value: "general", label: "General" },
];

const SOURCES = [
  { value: "all", label: "All Sources" },
  { value: "deepeval", label: "DeepEval Stock" },
  { value: "atlas-native", label: "Atlas-Native" },
  { value: "tenant-private", label: "Tenant-Private" },
];

const CATEGORY_ICONS: Record<string, typeof FlaskConical> = {
  rag: Brain,
  agent: Bot,
  conversational: MessageSquare,
  safety: Shield,
  summarization: FileText,
  custom: Settings,
  general: FlaskConical,
};

const CATEGORY_COLORS: Record<string, string> = {
  rag: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  agent: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  conversational: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  safety: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  summarization: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  custom: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  general: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

const SOURCE_COLORS: Record<string, string> = {
  deepeval: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  "atlas-native": "bg-primary/10 text-primary border-primary/20",
  "tenant-private": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  deepeval: "DeepEval",
  "atlas-native": "Atlas",
  "tenant-private": "Custom",
};

interface MetricListResponse {
  items: EvalMetric[];
  total: number;
}

function MetricCard({
  metric,
  selected,
  onClick,
}: {
  metric: EvalMetric;
  selected: boolean;
  onClick: () => void;
}) {
  const catKey = (metric.category || "general").toLowerCase();
  const srcKey = (metric.source || "deepeval").toLowerCase();
  const CatIcon = CATEGORY_ICONS[catKey] ?? FlaskConical;
  const catColor = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.general;
  const srcColor = SOURCE_COLORS[srcKey] ?? SOURCE_COLORS.deepeval;
  const srcLabel = SOURCE_LABELS[srcKey] ?? metric.source;

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/40 ${selected ? "border-primary/60 ring-1 ring-primary/30 bg-primary/5" : ""}`}
      onClick={onClick}
      data-testid={`card-metric-${metric.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-md ${catColor} shrink-0`}>
              <CatIcon className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold truncate">{metric.name}</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${selected ? "rotate-90 text-primary" : ""}`} />
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {metric.description || metric.criteria || "No description available."}
        </p>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${catColor}`}>
            {metric.category}
          </Badge>
          <Badge variant="outline" className={`text-[10px] ${srcColor}`}>
            {srcLabel}
          </Badge>
          {metric.threshold != null && (
            <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground">
              <Gauge className="w-2.5 h-2.5 mr-1" />
              {metric.threshold}
            </Badge>
          )}
          {(metric.usageCount ?? 0) > 0 && (
            <Badge variant="outline" className="text-[10px] bg-muted/50 text-muted-foreground">
              <Link2 className="w-2.5 h-2.5 mr-1" />
              {metric.usageCount}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricDetailPanel({
  metric,
  onClose,
  onAttach,
}: {
  metric: EvalMetric;
  onClose: () => void;
  onAttach: () => void;
}) {
  const catKey = (metric.category || "general").toLowerCase();
  const srcKey = (metric.source || "deepeval").toLowerCase();
  const CatIcon = CATEGORY_ICONS[catKey] ?? FlaskConical;
  const catColor = CATEGORY_COLORS[catKey] ?? CATEGORY_COLORS.general;
  const srcColor = SOURCE_COLORS[srcKey] ?? SOURCE_COLORS.deepeval;

  const evalParamsArray = Array.isArray(metric.evaluationParams) ? metric.evaluationParams : [];

  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="pb-4 border-b">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-md ${catColor}`}>
            <CatIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <SheetTitle className="text-base leading-tight">{metric.name}</SheetTitle>
            <SheetDescription className="text-xs mt-0.5">
              v{metric.version} · {metric.metricType}
            </SheetDescription>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap mt-2">
          <Badge variant="outline" className={`text-[10px] ${catColor}`}>{metric.category}</Badge>
          <Badge variant="outline" className={`text-[10px] ${srcColor}`}>{metric.source}</Badge>
          {metric.strictMode && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">Strict</Badge>
          )}
          {metric.asyncMode && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">Async</Badge>
          )}
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1 py-4">
        <div className="space-y-5">
          {/* Description */}
          {metric.description && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Description</h4>
              <p className="text-sm leading-relaxed">{metric.description}</p>
            </div>
          )}

          {/* Criteria / Algorithm */}
          {metric.criteria && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Evaluation Criteria</h4>
              <div className="rounded-md bg-muted/40 border p-3">
                <p className="text-xs leading-relaxed font-mono whitespace-pre-wrap">{metric.criteria}</p>
              </div>
            </div>
          )}

          {/* Config */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Configuration</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-2.5">
                <div className="text-[10px] text-muted-foreground mb-0.5">Default Threshold</div>
                <div className="text-sm font-semibold">{metric.threshold ?? "—"}</div>
              </div>
              <div className="rounded-md border p-2.5">
                <div className="text-[10px] text-muted-foreground mb-0.5">Judge Model</div>
                <div className="text-xs font-semibold truncate">{metric.judgeModel ?? "—"}</div>
              </div>
              <div className="rounded-md border p-2.5">
                <div className="text-[10px] text-muted-foreground mb-0.5">Metric Type</div>
                <div className="text-xs font-semibold">{metric.metricType}</div>
              </div>
              <div className="rounded-md border p-2.5">
                <div className="text-[10px] text-muted-foreground mb-0.5">In Use By</div>
                <div className="text-sm font-semibold">{metric.usageCount ?? 0} agent{metric.usageCount !== 1 ? "s" : ""}</div>
              </div>
            </div>
          </div>

          {/* Evaluation Params */}
          {evalParamsArray.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Evaluation Parameters</h4>
              <div className="flex flex-wrap gap-1.5">
                {evalParamsArray.map((p, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] bg-muted/40">
                    <Tag className="w-2.5 h-2.5 mr-1" />
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Sample Reasoning */}
          {metric.source !== "tenant-private" && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Sample Reasoning Trace</h4>
              <div className="rounded-md bg-muted/40 border p-3 space-y-1.5">
                <div className="text-[10px] text-muted-foreground font-medium">Example evaluation output:</div>
                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  "The response {metric.category === "safety" ? "does not contain harmful content and" : metric.category === "rag" ? "retrieves relevant context and"
                  : ""} scores {metric.threshold ?? 0.5} on the {metric.name} metric, {(metric.threshold ?? 0.5) >= 0.7 ? "passing" : "failing"} the threshold of {metric.threshold ?? 0.5}."
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="border-t pt-4 flex flex-col gap-2">
        <Button className="w-full" onClick={onAttach} data-testid="button-attach-metric">
          <Link2 className="w-4 h-4 mr-2" />
          Attach to Agent
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" data-testid="button-clone-metric">
            <Copy className="w-4 h-4 mr-2" />
            Clone
          </Button>
          {metric.source === "tenant-private" && (
            <Button variant="outline" className="flex-1" data-testid="button-edit-metric">
              <Settings className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachToAgentModal({
  metric,
  open,
  onClose,
}: {
  metric: EvalMetric | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [scope, setScope] = useState("end-to-end");

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    enabled: open,
  });

  const attachMutation = useMutation({
    mutationFn: async () => {
      if (!metric || !selectedAgentId) throw new Error("Missing required fields");
      const res = await apiRequest("POST", `/api/eval/metrics/${metric.id}/attach`, {
        agentId: selectedAgentId,
        scope,
        threshold: metric.threshold,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/metrics"] });
      toast({
        title: "Metric attached",
        description: `${metric?.name} has been attached to the selected agent.`,
      });
      onClose();
      setSelectedAgentId("");
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to attach metric",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-attach-metric">
        <DialogHeader>
          <DialogTitle>Attach Metric to Agent</DialogTitle>
          <DialogDescription>
            {metric ? `Attach "${metric.name}" to one of your registered agents.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Metric summary */}
          {metric && (
            <div className="rounded-md border bg-muted/30 p-3 flex items-center gap-3">
              <FlaskConical className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{metric.name}</p>
                <p className="text-xs text-muted-foreground">Default threshold: {metric.threshold ?? 0.5}</p>
              </div>
            </div>
          )}

          {/* Agent picker */}
          <div className="space-y-1.5">
            <Label htmlFor="agent-select" className="text-xs">Agent</Label>
            {agentsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger id="agent-select" data-testid="select-agent">
                  <SelectValue placeholder="Select an agent…" />
                </SelectTrigger>
                <SelectContent>
                  {(agents || []).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id} data-testid={`option-agent-${agent.id}`}>
                      <div className="flex items-center gap-2">
                        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label htmlFor="scope-select" className="text-xs">Evaluation Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger id="scope-select" data-testid="select-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="end-to-end">End-to-End</SelectItem>
                <SelectItem value="component">Component</SelectItem>
                <SelectItem value="retrieval">Retrieval</SelectItem>
                <SelectItem value="generation">Generation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Threshold display */}
          {metric && (
            <div className="rounded-md border p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Threshold</span>
                <span className="text-sm font-semibold">{metric.threshold ?? 0.5}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Using metric's default threshold. Adjust after attaching.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-attach">Cancel</Button>
          <Button
            disabled={!selectedAgentId || attachMutation.isPending}
            onClick={() => attachMutation.mutate()}
            data-testid="button-confirm-attach"
          >
            {attachMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Attaching…</>
            ) : (
              <><CheckCircle className="w-4 h-4 mr-2" />Attach Metric</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EvalMetrics() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedMetric, setSelectedMetric] = useState<EvalMetric | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const limit = 24;

  const params = new URLSearchParams();
  if (categoryFilter !== "all") params.set("category", categoryFilter);
  if (sourceFilter !== "all") params.set("source", sourceFilter);
  if (searchQuery.trim()) params.set("search", searchQuery.trim());
  params.set("page", String(page));
  params.set("limit", String(limit));

  const queryString = params.toString();

  const { data: metricsData, isLoading } = useQuery<MetricListResponse>({
    queryKey: [`/api/eval/metrics?${queryString}`],
  });

  const metrics = metricsData?.items ?? [];
  const total = metricsData?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of metrics) {
      const cat = (m.category || "general").toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [metrics]);

  const handleSelectMetric = (metric: EvalMetric) => {
    setSelectedMetric(metric);
    setPanelOpen(true);
  };

  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    setPage(1);
  };

  const handleCategoryChange = (v: string) => {
    setCategoryFilter(v);
    setPage(1);
  };

  const handleSourceChange = (v: string) => {
    setSourceFilter(v);
    setPage(1);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Rail */}
      <aside className="w-52 shrink-0 border-r flex flex-col bg-muted/10" data-testid="aside-metric-filters">
        <div className="p-3 border-b">
          <Link href="/evals">
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground h-7 px-2" data-testid="link-back-evals">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Eval Studio
            </Button>
          </Link>
        </div>

        <div className="p-3 border-b">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Category</p>
          <div className="space-y-0.5">
            {CATEGORIES.map((cat) => {
              const CatIcon = CATEGORY_ICONS[cat.value] ?? FlaskConical;
              const isActive = categoryFilter === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => handleCategoryChange(cat.value)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                  data-testid={`filter-category-${cat.value}`}
                >
                  <div className="flex items-center gap-1.5">
                    <CatIcon className="w-3 h-3" />
                    {cat.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Source</p>
          <div className="space-y-0.5">
            {SOURCES.map((src) => {
              const isActive = sourceFilter === src.value;
              return (
                <button
                  key={src.value}
                  onClick={() => handleSourceChange(src.value)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                  data-testid={`filter-source-${src.value}`}
                >
                  {src.label}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" data-testid="heading-metric-library">
              <ListChecks className="w-5 h-5 text-primary" />
              Metric Library
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {total} metric{total !== 1 ? "s" : ""}{categoryFilter !== "all" ? ` in ${categoryFilter}` : ""}{sourceFilter !== "all" ? ` · ${sourceFilter}` : ""}
            </p>
          </div>
          <div className="relative max-w-72 w-full">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search metrics…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-8 h-9 text-sm"
              data-testid="input-metric-search"
            />
            {searchQuery && (
              <button onClick={() => handleSearchChange("")} className="absolute right-2.5 top-2.5">
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        <ScrollArea className="flex-1">
          <div className="p-5">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            ) : metrics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No metrics found</p>
                <p className="text-xs text-muted-foreground/70">Try adjusting the filters or search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {metrics.map((metric) => (
                  <MetricCard
                    key={metric.id}
                    metric={metric}
                    selected={selectedMetric?.id === metric.id}
                    onClick={() => handleSelectMetric(metric)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Detail Panel (Sheet) */}
      <Sheet open={panelOpen} onOpenChange={(v) => { if (!v) setPanelOpen(false); }}>
        <SheetContent side="right" className="w-[420px] sm:w-[440px] flex flex-col p-5" data-testid="sheet-metric-detail">
          {selectedMetric && (
            <MetricDetailPanel
              metric={selectedMetric}
              onClose={() => setPanelOpen(false)}
              onAttach={() => {
                setAttachOpen(true);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Attach Modal */}
      <AttachToAgentModal
        metric={selectedMetric}
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
      />
    </div>
  );
}
