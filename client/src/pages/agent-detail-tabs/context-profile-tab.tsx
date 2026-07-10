/**
 * Context Profile tab — extracted from agent-detail.tsx (monolith split,
 * tranche 1). Renders its own <TabsContent>, so it must be mounted inside the
 * page's <Tabs>.
 *
 * Truthfulness: every number here is MEASURED — read from the latest run
 * trace's provenanceSnapshot.contextLayerUsage (recorded by the runtime per
 * run). Agents that have never run show an empty state instead of invented
 * allocations. (This tab previously rendered hardcoded token figures styled
 * as live telemetry.)
 */
import { useQuery } from "@tanstack/react-query";
import { TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Settings, Brain, ShieldAlert, Sparkles, History, Database, Wrench, Layers3, Target, FileText } from "lucide-react";
import { useIndustry } from "@/components/industry-provider";
import { EmptyState, QueryBoundary } from "@/components/ui-vocab";
import { formatDateTime } from "@/lib/format";
import type { Agent } from "@shared/schema";

interface ContextLayerUsage {
  layer: string;
  budgetKey?: string;
  tokensUsed: number;
  budgetAllocated: number | null;
}

const LAYER_META: Record<string, { label: string; icon: typeof Settings; color: string }> = {
  system_prompt:       { label: "System Instructions", icon: Settings, color: "bg-blue-500" },
  task_prompt:         { label: "Task Prompt", icon: FileText, color: "bg-sky-500" },
  task:                { label: "Task & Tools", icon: FileText, color: "bg-sky-500" },
  outcome_contract:    { label: "Outcome Contract", icon: Target, color: "bg-emerald-500" },
  outcome:             { label: "Outcome Contract", icon: Target, color: "bg-emerald-500" },
  governance_policies: { label: "Governance Policies", icon: ShieldAlert, color: "bg-red-500" },
  governance:          { label: "Governance Policies", icon: ShieldAlert, color: "bg-red-500" },
  skills:              { label: "Skill Instructions", icon: Sparkles, color: "bg-amber-500" },
  capabilities:        { label: "Skill Instructions", icon: Sparkles, color: "bg-amber-500" },
  knowledge_graph:     { label: "Knowledge Graph", icon: Brain, color: "bg-purple-500" },
  kb_retrieval:        { label: "Retrieved Knowledge", icon: Database, color: "bg-cyan-500" },
  knowledge:           { label: "Knowledge", icon: Database, color: "bg-cyan-500" },
  execution_history:   { label: "Execution History", icon: History, color: "bg-green-500" },
  history:             { label: "Execution History", icon: History, color: "bg-green-500" },
  tool_schemas:        { label: "Tool Descriptions", icon: Wrench, color: "bg-orange-500" },
};

const FALLBACK_COLORS = ["bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-green-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500", "bg-teal-500"];

function layerMeta(layer: string, idx: number) {
  return LAYER_META[layer] ?? {
    label: layer.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    icon: Layers3,
    color: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
  };
}

export function ContextProfileTab({ agent }: { agent: Agent }) {
  const { industry } = useIndustry();

  const { data: traces, isLoading, isError, error, refetch } = useQuery<any[]>({
    queryKey: [`/api/agents/${agent.id}/traces`],
  });

  const industryLabel = industry?.label || "General";
  const memoryConfig = (agent.memoryRagConfig as any) || {};

  // Latest trace that recorded real context layer usage.
  const measuredTrace = (traces ?? []).find(
    t => Array.isArray(t?.provenanceSnapshot?.contextLayerUsage) && t.provenanceSnapshot.contextLayerUsage.length > 0
  );
  const rawLayers: ContextLayerUsage[] = measuredTrace?.provenanceSnapshot?.contextLayerUsage ?? [];

  // Merge duplicate layers (a run can record a layer more than once, e.g. two KB retrievals).
  const merged = new Map<string, ContextLayerUsage>();
  for (const l of rawLayers) {
    const prev = merged.get(l.layer);
    if (prev) {
      prev.tokensUsed += l.tokensUsed || 0;
      if (l.budgetAllocated != null) prev.budgetAllocated = (prev.budgetAllocated ?? 0) + l.budgetAllocated;
    } else {
      merged.set(l.layer, { ...l, tokensUsed: l.tokensUsed || 0 });
    }
  }
  const layers = Array.from(merged.values()).sort((a, b) => b.tokensUsed - a.tokensUsed);

  const totalUsed = layers.reduce((sum, l) => sum + l.tokensUsed, 0);
  const totalAllocated = layers.some(l => l.budgetAllocated != null)
    ? layers.reduce((sum, l) => sum + (l.budgetAllocated ?? 0), 0)
    : null;
  const utilization = totalAllocated && totalAllocated > 0 ? Math.round((totalUsed / totalAllocated) * 100) : null;

  return (
    <TabsContent value="context-profile" className="flex flex-col gap-4 mt-0" data-testid="tab-content-context-profile">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Layers3 className="w-4 h-4" /> Context Profile
          </h3>
          <p className="text-sm text-muted-foreground">
            {measuredTrace
              ? <>Measured context allocation from the run on {formatDateTime(measuredTrace.startedAt ?? measuredTrace.createdAt)} ({industryLabel})</>
              : <>Context allocation across source categories for this agent ({industryLabel})</>}
          </p>
        </div>
        {measuredTrace && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[11px]" data-testid="badge-token-budget">
              {totalUsed.toLocaleString()}{totalAllocated ? ` / ${totalAllocated.toLocaleString()}` : ""} tokens
            </Badge>
            {utilization != null && (
              <Badge variant="outline" className={`text-[11px] ${
                utilization > 90 ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20" :
                utilization > 70 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" :
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              }`} data-testid="badge-utilization">
                {utilization}% of budget
              </Badge>
            )}
          </div>
        )}
      </div>

      <QueryBoundary isLoading={isLoading} isError={isError} error={error as Error | null} onRetry={() => refetch()}>
        {!measuredTrace ? (
          <Card data-testid="card-context-budget">
            <CardContent className="py-10">
              <EmptyState
                icon={<Layers3 className="w-8 h-8" aria-hidden="true" />}
                title="No context measurements yet"
                description="Run this agent (Run Test or a deployment cycle) to record how its context window is actually allocated. This panel only shows measured data — never estimates."
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card data-testid="card-context-budget">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Token Usage by Context Source</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex h-6 rounded-md overflow-hidden mb-4" data-testid="context-budget-bar">
                  {layers.map((l, idx) => {
                    const meta = layerMeta(l.layer, idx);
                    const pct = totalUsed > 0 ? (l.tokensUsed / totalUsed) * 100 : 0;
                    return (
                      <div
                        key={l.layer}
                        className={`${meta.color} transition-all`}
                        style={{ width: `${Math.max(pct, 1)}%` }}
                        title={`${meta.label}: ${l.tokensUsed.toLocaleString()} tokens (${Math.round(pct)}%)`}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {layers.map((l, idx) => {
                    const meta = layerMeta(l.layer, idx);
                    const Icon = meta.icon;
                    const pct = totalUsed > 0 ? Math.round((l.tokensUsed / totalUsed) * 100) : 0;
                    return (
                      <div key={l.layer} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`context-source-${l.layer}`}>
                        <div className={`w-2.5 h-2.5 rounded-full ${meta.color} shrink-0`} />
                        <div className="flex flex-col gap-0 min-w-0">
                          <div className="flex items-center gap-1">
                            <Icon className="w-3 h-3 text-muted-foreground" />
                            <span className="text-[11px] font-medium truncate">{meta.label}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{l.tokensUsed.toLocaleString()} tokens ({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card data-testid="card-context-priority">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Usage vs. Layer Budget</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {layers.map((l, idx) => {
                    const meta = layerMeta(l.layer, idx);
                    const Icon = meta.icon;
                    const pctOfBudget = l.budgetAllocated ? Math.min(Math.round((l.tokensUsed / l.budgetAllocated) * 100), 100) : null;
                    return (
                      <div key={l.layer} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`priority-${idx}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] text-muted-foreground font-mono w-4">#{idx + 1}</span>
                          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate">{meta.label}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {pctOfBudget != null
                            ? <><Progress value={pctOfBudget} className="h-1 w-16" /><span className="text-[10px] text-muted-foreground w-8 text-right">{pctOfBudget}%</span></>
                            : <span className="text-[10px] text-muted-foreground">no budget set</span>}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card data-testid="card-context-config">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Configuration Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                    <span className="text-sm">Layer Budget Total</span>
                    <span className="text-sm font-medium">{totalAllocated ? `${totalAllocated.toLocaleString()} tokens` : "Not configured"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                    <span className="text-sm">Memory Strategy</span>
                    <span className="text-sm font-medium capitalize">{memoryConfig.strategy || "Not configured"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                    <span className="text-sm">RAG Retrieval</span>
                    <span className="text-sm font-medium">{memoryConfig.ragEnabled ? "Enabled" : "Not configured"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-md border">
                    <span className="text-sm">Industry Preset</span>
                    <Badge variant="outline" className="text-[10px]">{industryLabel}</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </QueryBoundary>
    </TabsContent>
  );
}
