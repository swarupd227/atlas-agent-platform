import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Agent } from "@shared/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Target, Shield, Wrench, Database, History, MessageSquare,
  ChevronDown, ChevronRight, ExternalLink, CheckCircle2,
  AlertCircle, Zap, Coins, RefreshCcw, Bot,
} from "lucide-react";

type LayerStatus = "populated" | "not_configured" | "dynamic";

type SkillSource = {
  skillId: string;
  name: string;
  source: "assigned" | "auto-matched";
};

type ContextLayer = {
  id: string;
  name: string;
  description: string;
  status: LayerStatus;
  tokenEstimate: number;
  previewContent: string;
  sourceLabel?: string;
  sourceUrl?: string;
  itemCount?: number;
  skillSources?: SkillSource[];
};

const LAYER_META: Record<string, { icon: typeof Target; color: string; bgColor: string; borderColor: string; number: number }> = {
  outcome:      { icon: Target,       number: 1, color: "text-blue-600 dark:text-blue-400",    bgColor: "bg-blue-50 dark:bg-blue-950/40",    borderColor: "border-blue-200 dark:border-blue-800" },
  governance:   { icon: Shield,       number: 2, color: "text-violet-600 dark:text-violet-400", bgColor: "bg-violet-50 dark:bg-violet-950/40", borderColor: "border-violet-200 dark:border-violet-800" },
  capabilities: { icon: Wrench,       number: 3, color: "text-amber-600 dark:text-amber-400",  bgColor: "bg-amber-50 dark:bg-amber-950/40",  borderColor: "border-amber-200 dark:border-amber-800" },
  knowledge:    { icon: Database,     number: 4, color: "text-green-600 dark:text-green-400",  bgColor: "bg-green-50 dark:bg-green-950/40",  borderColor: "border-green-200 dark:border-green-800" },
  history:      { icon: History,      number: 5, color: "text-orange-600 dark:text-orange-400",bgColor: "bg-orange-50 dark:bg-orange-950/40",borderColor: "border-orange-200 dark:border-orange-800" },
  task:         { icon: MessageSquare,number: 6, color: "text-slate-600 dark:text-slate-400",  bgColor: "bg-slate-50 dark:bg-slate-950/40",  borderColor: "border-slate-200 dark:border-slate-800" },
};

const DEFAULT_BUDGETS: Record<string, number> = {
  outcome: 400, governance: 600, capabilities: 500, knowledge: 800, history: 400, task: 1024,
};

function StatusBadge({ status }: { status: LayerStatus }) {
  if (status === "populated") return (
    <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40" data-testid="badge-status-populated">
      <CheckCircle2 className="w-3 h-3" /> Populated
    </Badge>
  );
  if (status === "dynamic") return (
    <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40" data-testid="badge-status-dynamic">
      <Zap className="w-3 h-3" /> Dynamic
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-xs gap-1 border-slate-300 text-slate-500 dark:text-slate-400" data-testid="badge-status-not-configured">
      <AlertCircle className="w-3 h-3" /> Not configured
    </Badge>
  );
}

function LayerCard({ layer }: { layer: ContextLayer }) {
  const [expanded, setExpanded] = useState(false);
  const meta = LAYER_META[layer.id];
  if (!meta) return null;
  const Icon = meta.icon;

  return (
    <Card
      className={`border ${meta.borderColor} transition-shadow hover:shadow-sm`}
      data-testid={`card-layer-${layer.id}`}
    >
      <CardHeader className={`p-4 pb-3 rounded-t-lg ${meta.bgColor}`}>
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${meta.bgColor} border-2 ${meta.borderColor} ${meta.color}`}>
            {meta.number}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className={`w-4 h-4 ${meta.color}`} />
              <span className="font-semibold text-sm" data-testid={`text-layer-name-${layer.id}`}>{layer.name}</span>
              <StatusBadge status={layer.status} />
              {layer.status !== "not_configured" && layer.tokenEstimate > 0 && (
                <Badge variant="secondary" className="text-xs ml-auto" data-testid={`badge-tokens-${layer.id}`}>
                  <Coins className="w-3 h-3 mr-1" />
                  ~{layer.tokenEstimate.toLocaleString()} tokens
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{layer.description}</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {layer.sourceUrl && layer.sourceLabel && (
              <Link href={layer.sourceUrl}>
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.color} hover:underline cursor-pointer`} data-testid={`link-source-${layer.id}`}>
                  <ExternalLink className="w-3 h-3" />
                  {layer.sourceLabel}
                </span>
              </Link>
            )}
            {layer.itemCount !== undefined && (
              <span className="text-xs text-muted-foreground" data-testid={`text-item-count-${layer.id}`}>
                {layer.itemCount} {layer.id === "knowledge" ? "chunks" : layer.id === "history" ? "runs" : "items"}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-${layer.id}`}
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {expanded ? "Collapse" : "Preview"}
          </Button>
        </div>

        {expanded && (
          <div data-testid={`text-preview-${layer.id}`}>
            {layer.id === "capabilities" && layer.skillSources && layer.skillSources.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-md bg-muted/40 border p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">
                    Agent Skills &mdash; {layer.skillSources[0].source === "assigned" ? "explicitly assigned" : "auto-matched by industry/tags"}
                  </p>
                  <div className="space-y-1.5">
                    {layer.skillSources.map(skill => (
                      <div key={skill.skillId} className="flex items-center gap-2" data-testid={`skill-row-${skill.skillId}`}>
                        <span className="text-xs font-mono flex-1 truncate">{skill.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs flex-shrink-0 ${skill.source === "assigned"
                            ? "border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:bg-blue-950/40"
                            : "border-zinc-300 text-zinc-500 bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:bg-zinc-900"}`}
                          data-testid={`badge-skill-source-${skill.skillId}`}
                        >
                          {skill.source === "assigned" ? "Assigned" : "Auto-matched"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
                {(() => {
                  const mcpIdx = layer.previewContent.indexOf("\n## MCP TOOLS");
                  if (mcpIdx === -1) return null;
                  return (
                    <div className="rounded-md bg-muted/40 border p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                      {layer.previewContent.slice(mcpIdx + 1)}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="rounded-md bg-muted/40 border p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                {layer.previewContent}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetTab({ layers, agentId, agentIndustry }: { layers: ContextLayer[]; agentId: string; agentIndustry?: string }) {
  const [budgets, setBudgets] = useState<Record<string, number>>(DEFAULT_BUDGETS);
  const { toast } = useToast();

  const total = Object.values(budgets).reduce((a, b) => a + b, 0);
  const CONTEXT_WINDOW = 128000;

  const { data: contextProfiles = [] } = useQuery<any[]>({
    queryKey: ["/api/context-profiles"],
  });

  const agentProfile = contextProfiles.find((p: any) => p.agentId === agentId && p.status === "active");

  useEffect(() => {
    if (agentProfile?.budgetAllocations && typeof agentProfile.budgetAllocations === "object") {
      setBudgets(prev => ({ ...prev, ...agentProfile.budgetAllocations }));
    } else {
      setBudgets(DEFAULT_BUDGETS);
    }
  }, [agentProfile?.id, agentId]);

  const saveMutation = useMutation({
    mutationFn: async (newBudgets: Record<string, number>) => {
      if (agentProfile?.id) {
        return apiRequest("PATCH", `/api/context-profiles/${agentProfile.id}`, { budgetAllocations: newBudgets });
      } else {
        return apiRequest("POST", `/api/context-profiles`, {
          agentId,
          name: "Context Budget",
          industry: agentIndustry || "custom",
          status: "active",
          budgetAllocations: newBudgets,
          totalCapacity: CONTEXT_WINDOW,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/context-profiles"] });
      toast({ title: "Context budgets saved", description: "These allocations will govern the next agent execution." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not persist budget allocations.", variant: "destructive" });
    },
  });

  const handleSave = () => saveMutation.mutate(budgets);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/40 border">
        <div>
          <div className="text-sm font-semibold" data-testid="text-total-budget">Total allocated: {total.toLocaleString()} tokens</div>
          <div className="text-xs text-muted-foreground">Context window: {CONTEXT_WINDOW.toLocaleString()} | Remaining: {(CONTEXT_WINDOW - total).toLocaleString()}</div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-budgets">
          {saveMutation.isPending ? "Saving…" : "Save budgets"}
        </Button>
      </div>

      <div className="space-y-5">
        {layers.map(layer => {
          const meta = LAYER_META[layer.id];
          if (!meta) return null;
          const Icon = meta.icon;
          const budget = budgets[layer.id] ?? DEFAULT_BUDGETS[layer.id] ?? 512;
          const usage = layer.tokenEstimate;
          const pct = Math.min(100, Math.round((usage / Math.max(budget, 1)) * 100));

          return (
            <div key={layer.id} className="space-y-2" data-testid={`budget-row-${layer.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                  <Label className="text-sm font-medium">{layer.name}</Label>
                  {layer.status === "populated" && (
                    <span className="text-xs text-muted-foreground">
                      using ~{usage.toLocaleString()} / {budget.toLocaleString()} tokens ({pct}%)
                    </span>
                  )}
                </div>
                <span className="text-sm font-mono text-muted-foreground" data-testid={`text-budget-value-${layer.id}`}>
                  {budget.toLocaleString()}
                </span>
              </div>
              <Slider
                min={0}
                max={layer.id === "knowledge" ? 4096 : layer.id === "task" ? 4096 : 1024}
                step={64}
                value={[budget]}
                onValueChange={([v]) => setBudgets(prev => ({ ...prev, [layer.id]: v }))}
                className="w-full"
                disabled={layer.id === "task"}
                data-testid={`slider-budget-${layer.id}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ContextEngine() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("stack");

  const { data: agents = [], isLoading: agentsLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  const { data: layers = [], isLoading: layersLoading, refetch } = useQuery<ContextLayer[]>({
    queryKey: ["/api/agents", selectedAgentId, "context-layers"],
    enabled: !!selectedAgentId,
  });

  const selectedAgent = agents.find(a => a.id === selectedAgentId);
  const populatedCount = layers.filter(l => l.status === "populated").length;
  const totalTokens = layers.reduce((sum, l) => sum + l.tokenEstimate, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Context Engine</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Inspect and govern the 6-layer context stack injected into each agent at runtime
            </p>
          </div>
          {selectedAgent && layers.length > 0 && (
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold text-foreground" data-testid="text-populated-count">{populatedCount} / 6</div>
                <div className="text-xs text-muted-foreground">layers populated</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-foreground" data-testid="text-total-tokens">{totalTokens.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">est. tokens</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Bot className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Select
            value={selectedAgentId}
            onValueChange={setSelectedAgentId}
          >
            <SelectTrigger className="w-80" data-testid="select-agent">
              <SelectValue placeholder={agentsLoading ? "Loading agents…" : "Select an agent to inspect"} />
            </SelectTrigger>
            <SelectContent>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id} data-testid={`option-agent-${a.id}`}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAgentId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
              data-testid="button-refresh-layers"
            >
              <RefreshCcw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedAgentId ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2" data-testid="text-empty-state">Select an agent to inspect</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Choose an agent from the dropdown above to see its full 6-layer context stack — what the agent knows before it starts working.
            </p>
          </div>
        ) : (
          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-6" data-testid="tabs-context-engine">
                <TabsTrigger value="stack" data-testid="tab-context-stack">Context Stack</TabsTrigger>
                <TabsTrigger value="budget" data-testid="tab-context-budget">Context Budget</TabsTrigger>
              </TabsList>

              <TabsContent value="stack" className="space-y-3 mt-0">
                {layersLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="p-4">
                      <div className="flex items-start gap-3">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-72" />
                        </div>
                      </div>
                    </Card>
                  ))
                ) : layers.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="text-no-layers">
                    No context layers found for this agent.
                  </div>
                ) : (
                  layers.map(layer => (
                    <LayerCard key={layer.id} layer={layer} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="budget" className="mt-0">
                {layersLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <BudgetTab layers={layers} agentId={selectedAgentId} agentIndustry={selectedAgent?.industry || undefined} />
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
