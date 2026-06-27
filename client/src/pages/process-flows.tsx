import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Workflow, Zap, Users, Brain, Bell, Square,
  Trash2, ArrowRight, ChevronRight, Sparkles, Loader2,
  Play, Database, GitBranch, Save,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { normalizeToGraph, stepsToGraph, type ProcessNode, type ProcessEdge } from "@shared/process-flow";
import FlowGraphCanvas from "@/components/flow-graph-canvas";


export default function ProcessFlows() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const urlParams = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return { outcomeId: p.get("outcomeId") || "", outcomeName: p.get("outcomeName") || "", kpis: p.get("kpis") || "" };
  }, [searchString]);

  const [graph, setGraph] = useState<{ nodes: ProcessNode[]; edges: ProcessEdge[] }>(() => {
    try {
      const raw = sessionStorage.getItem("process-flow-import-steps");
      if (raw) {
        sessionStorage.removeItem("process-flow-import-steps");
        const g = normalizeToGraph(JSON.parse(raw), "Process Flow");
        if (g && g.nodes.length > 0) return { nodes: g.nodes, edges: g.edges };
      }
    } catch {}
    return { nodes: [], edges: [] };
  });
  // Bump to remount the canvas when the whole graph is replaced (AI / template / load).
  const [flowKey, setFlowKey] = useState(0);
  const replaceGraph = (g: { nodes: ProcessNode[]; edges: ProcessEdge[] }) => { setGraph(g); setFlowKey(k => k + 1); };

  const [aiDescription, setAiDescription] = useState(() => urlParams.outcomeName || "");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [flowName, setFlowName] = useState(() => urlParams.outcomeName ? `${urlParams.outcomeName} Flow` : "");

  const generateMutation = useMutation({
    mutationFn: async (description: string) => {
      const outcomeContext = urlParams.outcomeName
        ? { name: urlParams.outcomeName, kpis: urlParams.kpis.split(",").filter(Boolean).map(k => ({ name: k.trim() })) }
        : undefined;
      const res = await apiRequest("POST", "/api/ai/generate-process-flow", {
        description,
        ...(outcomeContext ? { outcomeContext } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.steps && Array.isArray(data.steps)) {
        const g = stepsToGraph(data.name || "Generated Flow", data.steps);
        replaceGraph({ nodes: g.nodes, edges: g.edges });
        setFlowName(data.name || "Generated Flow");
        toast({ title: "Process flow generated" });
      }
    },
    onError: () => {
      toast({ title: "Generation failed", description: "Could not generate flow. Please try again.", variant: "destructive" });
    },
  });

  const queryClient = useQueryClient();

  // When opened against a specific outcome, load its persisted flow (unless the
  // detail page already handed off steps via sessionStorage).
  const { data: outcomeData } = useQuery<any>({
    queryKey: ["/api/outcomes", urlParams.outcomeId],
    enabled: !!urlParams.outcomeId,
  });
  const loadedFlowRef = useRef(false);
  useEffect(() => {
    if (loadedFlowRef.current || !urlParams.outcomeId || !outcomeData) return;
    loadedFlowRef.current = true;
    if (graph.nodes.length > 0) return; // sessionStorage handoff wins
    const g = normalizeToGraph(outcomeData?.processFlow, urlParams.outcomeName || "Process Flow");
    if (g && g.nodes.length > 0) {
      replaceGraph({ nodes: g.nodes, edges: g.edges });
      setFlowName(g.name || (urlParams.outcomeName ? `${urlParams.outcomeName} Flow` : "Process Flow"));
    }
  }, [outcomeData, urlParams.outcomeId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/outcomes/${urlParams.outcomeId}/process-flow`, {
        name: flowName,
        nodes: graph.nodes,
        edges: graph.edges,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outcomes", urlParams.outcomeId] });
      toast({ title: "Process flow saved", description: "This flow is now attached to the outcome." });
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not save the flow to the outcome.", variant: "destructive" });
    },
  });

  const [compiled, setCompiled] = useState<any | null>(null);
  const [compileOpen, setCompileOpen] = useState(false);
  const compileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/process-flow/compile", { name: flowName, nodes: graph.nodes, edges: graph.edges });
      return res.json();
    },
    onSuccess: (data) => { setCompiled(data); setCompileOpen(true); },
    onError: () => toast({ title: "Could not compile flow", variant: "destructive" }),
  });

  const totalMins = graph.nodes.reduce((s, n) => s + (n.estimatedMins || 0), 0);
  const nodeCount = graph.nodes.length;

  return (
    <div className="flex flex-col h-full" data-testid="page-process-flows">
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <Workflow className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Process Flow Studio</h1>
          <p className="text-xs text-muted-foreground">Design how your automation works in plain language</p>
        </div>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAiPanelOpen(v => !v)}
          data-testid="button-toggle-ai-panel"
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5 text-purple-500" />
          {aiPanelOpen ? "Close AI" : "Describe Workflow"}
        </Button>
        {urlParams.outcomeId && nodeCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-flow-to-outcome"
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Save to Outcome
          </Button>
        )}
        {urlParams.outcomeId && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/outcomes/${urlParams.outcomeId}`)}
            data-testid="button-back-to-outcome"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-1.5 rotate-180" />
            Back to Outcome
          </Button>
        )}
        {nodeCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => compileMutation.mutate()}
            disabled={compileMutation.isPending}
            data-testid="button-validate-flow"
          >
            {compileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5 mr-1.5" />}
            Validate &amp; Preview
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main: Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* AI Panel */}
          {aiPanelOpen && (
            <div className="border-b p-4 bg-muted/20 flex flex-col gap-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                Describe your workflow in plain English
              </p>
              <Textarea
                value={aiDescription}
                onChange={e => setAiDescription(e.target.value)}
                placeholder="e.g. When a new supplier invoice arrives, check it against our purchase order, get manager approval for invoices over $10K, then schedule payment and notify the supplier."
                className="text-sm resize-none h-20"
                data-testid="input-ai-description"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate(aiDescription)}
                  disabled={!aiDescription.trim() || generateMutation.isPending}
                  data-testid="button-ai-generate"
                >
                  {generateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                  Generate Flow
                </Button>
              </div>
            </div>
          )}

          {/* Outcome context banner */}
          {urlParams.outcomeName && (
            <div className="px-4 py-2 bg-primary/5 border-b flex items-center gap-2" data-testid="banner-outcome-context">
              <Workflow className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs text-muted-foreground">
                Designing for outcome: <span className="font-medium text-foreground">{urlParams.outcomeName}</span>
                {urlParams.kpis && <span> · KPIs: {urlParams.kpis}</span>}
              </p>
            </div>
          )}

          {/* Canvas header */}
          <div className="flex items-center gap-3 p-3 border-b bg-muted/10">
            {nodeCount > 0 ? (
              <>
                <Input
                  value={flowName}
                  onChange={e => setFlowName(e.target.value)}
                  className="h-7 text-sm font-medium w-56"
                  placeholder="Flow name…"
                  data-testid="input-flow-name"
                />
                <Badge variant="secondary" className="text-[10px]">{nodeCount} steps</Badge>
                <Badge variant="outline" className="text-[10px]">{graph.edges.length} connections</Badge>
                {totalMins > 0 && (
                  <span className="text-xs text-muted-foreground">{totalMins >= 60 ? `~${Math.round(totalMins / 60)}h` : `~${totalMins}m`} total</span>
                )}
                <div className="flex-1" />
                <span className="text-[11px] text-muted-foreground hidden lg:inline">Drag from a node's right dot to connect · click a connection to add a branch condition</span>
                <button
                  type="button"
                  onClick={() => { replaceGraph({ nodes: [], edges: [] }); setFlowName(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-clear-flow"
                >
                  Clear
                </button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Add nodes from the canvas palette, pick a template, or describe your workflow to generate a flow</span>
            )}
          </div>

          {/* Canvas — React Flow graph editor (branch / parallel / loop) */}
          <div className="flex-1 min-h-0" data-testid="flow-canvas-container">
            <FlowGraphCanvas
              flowKey={`flow-${flowKey}`}
              initialNodes={graph.nodes}
              initialEdges={graph.edges}
              onChange={(nodes, edges) => setGraph({ nodes, edges })}
            />
          </div>
        </div>
      </div>

      <Dialog open={compileOpen} onOpenChange={setCompileOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-execution-plan">
          <DialogHeader><DialogTitle>Execution Plan</DialogTitle></DialogHeader>
          {compiled && (compiled.valid ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-[10px]">{compiled.totalNodes} steps</Badge>
                <Badge variant="outline" className="text-[10px]">{compiled.totalWaves} stages</Badge>
                <Badge variant="outline" className="text-[10px]">max {compiled.maxParallelism} parallel</Badge>
                <Badge variant="outline" className="text-[10px]">{compiled.branches.length} branch point{compiled.branches.length !== 1 ? "s" : ""}</Badge>
                {compiled.loops.length > 0 && <Badge variant="outline" className="text-[10px]">{compiled.loops.length} loop{compiled.loops.length !== 1 ? "s" : ""}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">Computed by the same wave-based DAG engine that runs agent teams. Steps in the same stage run in parallel.</p>
              <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                {compiled.waves.map((w: any) => (
                  <div key={w.wave} className="rounded-md border p-2" data-testid={`exec-stage-${w.wave}`}>
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Stage {w.wave}{w.parallel ? " · parallel" : ""}</div>
                    <div className="flex flex-wrap gap-1">
                      {w.nodes.map((n: any) => <Badge key={n.id} variant="secondary" className="text-[10px]">{n.label}</Badge>)}
                    </div>
                  </div>
                ))}
              </div>
              {compiled.branches.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium">Conditional branches</p>
                  {compiled.branches.map((b: any) => (
                    <p key={b.nodeId} className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{b.label}</span> → {b.outgoing.map((o: any) => `${o.toLabel}${o.condition ? ` [${o.condition}]` : o.label ? ` (${o.label})` : ""}`).join("  |  ")}
                    </p>
                  ))}
                </div>
              )}
              {compiled.loops.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Loops run as bounded retries: {compiled.loops.map((l: any) => `${l.from}→${l.to}`).join(", ")}</p>
              )}
              {compiled.warnings?.length > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">{compiled.warnings.join(" ")}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-destructive">{compiled.message || "This flow can't be compiled into an execution plan."}</p>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
