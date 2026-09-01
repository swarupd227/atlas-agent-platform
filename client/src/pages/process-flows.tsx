import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Workflow, Zap, Users, Brain, Bell, Square,
  Trash2, ArrowRight, ChevronRight, Sparkles, Loader2,
  Play, Database, GitBranch, Save, Mic, FolderOpen, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileAttach, type AttachedFile } from "@/components/file-attach";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { normalizeToGraph, type ProcessNode, type ProcessEdge } from "@shared/process-flow";
import FlowGraphCanvas, { type FlowIssue } from "@/components/flow-graph-canvas";
import { TeamProposalDialog } from "@/components/team-proposal-flow";


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
  const [aiFiles, setAiFiles] = useState<AttachedFile[]>([]);
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
        fileIds: aiFiles.map(f => f.id),
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Server now returns a real graph (nodes + edges, branches included)
      // rather than a flat step list -- normalizeToGraph handles both shapes,
      // so this also stays compatible if an older cached response ever shows up.
      const g = normalizeToGraph(data, data.name || "Generated Flow");
      if (g && g.nodes.length > 0) {
        replaceGraph({ nodes: g.nodes, edges: g.edges });
        setFlowName(data.name || "Generated Flow");
        toast({ title: "Process flow generated" });
      } else {
        // The request can succeed (200 OK) while still carrying an empty
        // graph -- e.g. the model's response got truncated and failed to
        // parse server-side. Without this, that case showed nothing at all:
        // no error, no flow, just a "Generate Flow" button silently ending.
        toast({ title: "Generation failed", description: "The AI didn't return a usable flow. Try a shorter description or simplify it, then retry.", variant: "destructive" });
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

  // Same query key outcome-detail.tsx already uses for its agent list -- react-query
  // dedupes/caches this, so visiting from the outcome page costs no extra request.
  const { data: allAgents } = useQuery<any[]>({ queryKey: ["/api/agents"], enabled: !!urlParams.outcomeId });
  const linkedTeamAgent = useMemo(
    () => (allAgents || []).find(a => a.agentType === "team" && a.outcomeId === urlParams.outcomeId && a.blueprintId),
    [allAgents, urlParams.outcomeId],
  );

  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [syncResultOpen, setSyncResultOpen] = useState(false);
  const [syncLegacyChoiceOpen, setSyncLegacyChoiceOpen] = useState(false);
  const syncMutation = useMutation({
    mutationFn: async (forceFullRebuild?: boolean) => {
      const res = await apiRequest("POST", `/api/outcomes/${urlParams.outcomeId}/process-flow/sync-to-automation`, {
        teamAgentId: linkedTeamAgent?.id,
        ...(forceFullRebuild ? { forceFullRebuild: true } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.needsChoice === "legacy_blueprint") {
        setSyncLegacyChoiceOpen(true);
        return;
      }
      setSyncResult(data.summary);
      setSyncResultOpen(true);
      toast({ title: "Synced to automation" });
    },
    onError: (err: Error) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const [compiled, setCompiled] = useState<any | null>(null);
  const [compileOpen, setCompileOpen] = useState(false);
  // The last validation's node/edge-anchored findings, badged onto the canvas.
  // Cleared the moment the graph is edited, so a badge never lingers on a step
  // the user has since fixed.
  const [validationIssues, setValidationIssues] = useState<FlowIssue[]>([]);
  const compileMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/process-flow/compile", { name: flowName, nodes: graph.nodes, edges: graph.edges });
      return res.json();
    },
    onSuccess: (data) => {
      setCompiled(data);
      setValidationIssues(Array.isArray(data.issues) ? data.issues : []);
      setCompileOpen(true);
    },
    onError: () => toast({ title: "Could not compile flow", variant: "destructive" }),
  });

  // ---- Standalone flow library (save/load, no outcome required) ----
  const [savedFlowId, setSavedFlowId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { data: savedFlows } = useQuery<any[]>({ queryKey: ["/api/process-flows"], enabled: libraryOpen });

  const saveToLibraryMutation = useMutation({
    mutationFn: async () => {
      const name = flowName.trim() || "Untitled flow";
      const body = { name, nodes: graph.nodes, edges: graph.edges };
      if (savedFlowId) {
        const res = await apiRequest("PUT", `/api/process-flows/${savedFlowId}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/process-flows", body);
      return res.json();
    },
    onSuccess: (data) => {
      setSavedFlowId(data.id);
      if (!flowName.trim() && data.name) setFlowName(data.name);
      queryClient.invalidateQueries({ queryKey: ["/api/process-flows"] });
      toast({ title: "Flow saved to library", description: "You can reload it any time from Open." });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const loadFlowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("GET", `/api/process-flows/${id}`);
      return res.json();
    },
    onSuccess: (rec) => {
      const g = normalizeToGraph(rec.graph, rec.name || "Process Flow");
      if (g && g.nodes.length > 0) {
        replaceGraph({ nodes: g.nodes, edges: g.edges });
        setFlowName(rec.name || g.name || "Process Flow");
        setSavedFlowId(rec.id);
        setValidationIssues([]);
        setLibraryOpen(false);
        toast({ title: "Flow loaded" });
      }
    },
    onError: () => toast({ title: "Could not load that flow", variant: "destructive" }),
  });

  const deleteFlowMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/process-flows/${id}`); return id; },
    onSuccess: (id) => {
      if (savedFlowId === id) setSavedFlowId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/process-flows"] });
      toast({ title: "Flow deleted" });
    },
    onError: () => toast({ title: "Could not delete that flow", variant: "destructive" }),
  });

  // ---- Voice dictation for the "Describe Workflow" panel ----
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceSupported = typeof window !== "undefined" && (("SpeechRecognition" in window) || ("webkitSpeechRecognition" in window));

  const toggleVoice = useCallback(() => {
    if (!voiceSupported) return;
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript;
      }
      if (chunk) setAiDescription(prev => (prev ? prev.trimEnd() + " " : "") + chunk.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [voiceSupported, listening]);

  const totalMins = graph.nodes.reduce((s, n) => s + (n.estimatedMins || 0), 0);
  const nodeCount = graph.nodes.length;

  const [showTeamProposal, setShowTeamProposal] = useState(false);
  const proposalDescription = useMemo(() => {
    const labelById = new Map(graph.nodes.map(n => [n.id, n.label] as const));
    const steps = graph.nodes.map(n => n.label).filter(Boolean).join(" → ");
    // Branch conditions live on edges, not nodes -- flattening to a plain
    // "A → B → C" chain (as this used to do) silently drops them, so the
    // team-drafting step downstream had nothing but prose to re-infer
    // branching from. Spell out each conditional edge explicitly.
    const branches = graph.edges
      .filter(e => e.condition)
      .map(e => `If ${e.condition}: ${labelById.get(e.from) || e.from} → ${labelById.get(e.to) || e.to}${e.label ? ` (${e.label})` : ""}`);
    const branchLines = branches.length > 0 ? `\n\nBranch conditions:\n${branches.join("\n")}` : "";
    return (flowName ? `${flowName}: ${steps}` : steps) + branchLines;
  }, [graph.nodes, graph.edges, flowName]);
  const proposalSteps = useMemo(
    () => graph.nodes.map(n => ({ type: n.type, label: n.label, description: n.description, actor: n.actor, config: n.config })),
    [graph.nodes],
  );

  return (
    <div className="flex flex-col h-full" data-testid="page-process-flows">
      <div className="flex items-center gap-3 p-4 border-b shrink-0">
        <Workflow className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Process Flow Studio</h1>
          <p className="text-xs text-muted-foreground">Describe the steps of a process, no KPI commitment required — for a goal you're accountable for, use Outcomes instead</p>
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
        <Button
          size="sm"
          variant="outline"
          onClick={() => setLibraryOpen(true)}
          data-testid="button-open-flow-library"
        >
          <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
          Open
        </Button>
        {nodeCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => saveToLibraryMutation.mutate()}
            disabled={saveToLibraryMutation.isPending}
            data-testid="button-save-flow-to-library"
          >
            {saveToLibraryMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {savedFlowId ? "Save" : "Save to Library"}
          </Button>
        )}
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
        {nodeCount > 0 && !linkedTeamAgent && (
          <Button size="sm" onClick={() => setShowTeamProposal(true)} data-testid="button-turn-into-automation">
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            Turn into a live automation
          </Button>
        )}
        {nodeCount > 0 && linkedTeamAgent && (
          <Button
            size="sm"
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
            data-testid="button-sync-to-automation"
          >
            {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
            Sync to Automation
          </Button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Main: Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* AI Panel */}
          {aiPanelOpen && (
            <div className="border-b p-4 bg-muted/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  Describe your workflow in plain English
                </p>
                {voiceSupported && (
                  <Button
                    size="sm"
                    variant={listening ? "default" : "outline"}
                    className={`h-7 ${listening ? "animate-pulse" : ""}`}
                    onClick={toggleVoice}
                    data-testid="button-voice-dictate"
                  >
                    <Mic className="w-3.5 h-3.5 mr-1.5" />
                    {listening ? "Listening… tap to stop" : "Dictate"}
                  </Button>
                )}
              </div>
              <Textarea
                value={aiDescription}
                onChange={e => setAiDescription(e.target.value)}
                placeholder="e.g. When a new supplier invoice arrives, check it against our purchase order, get manager approval for invoices over $10K, then schedule payment and notify the supplier."
                className="text-sm resize-none h-20"
                data-testid="input-ai-description"
              />
              <FileAttach
                context="process_flow"
                value={aiFiles}
                onChange={setAiFiles}
                disabled={generateMutation.isPending}
                variant="dropzone"
                label="Or drop the process document — an SOP, runbook, or policy"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={() => generateMutation.mutate(aiDescription)}
                  disabled={(!aiDescription.trim() && !aiFiles.length) || generateMutation.isPending}
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
              issues={validationIssues}
              onChange={(nodes, edges) => { setGraph({ nodes, edges }); if (validationIssues.length) setValidationIssues([]); }}
            />
          </div>
        </div>
      </div>

      <Dialog open={compileOpen} onOpenChange={setCompileOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-execution-plan">
          <DialogHeader><DialogTitle>Validation &amp; Execution Plan</DialogTitle></DialogHeader>
          {compiled && (compiled.valid ? (
            <div className="flex flex-col gap-3">
              {/* Validation verdict first: an honest go/no-go, not just a plan. */}
              {(compiled.issues?.length ?? 0) === 0 ? (
                <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2" data-testid="validation-clean">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">No issues found — this flow is well-formed.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2" data-testid="validation-issues">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                      {compiled.issues.length} issue{compiled.issues.length !== 1 ? "s" : ""} to review — the highlighted steps on the canvas
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1 pl-1">
                    {compiled.issues.map((it: FlowIssue, i: number) => (
                      <li key={i} className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5" data-testid={`validation-issue-${it.code}`}>
                        <span className="mt-0.5">•</span><span>{it.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
            </div>
          ) : (
            <p className="text-sm text-destructive">{compiled.message || "This flow can't be compiled into an execution plan."}</p>
          ))}
        </DialogContent>
      </Dialog>

      <TeamProposalDialog
        open={showTeamProposal}
        onOpenChange={setShowTeamProposal}
        initialDescription={proposalDescription}
        processFlowSteps={proposalSteps}
      />

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-flow-library">
          <DialogHeader><DialogTitle>Saved process flows</DialogTitle></DialogHeader>
          {!savedFlows ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : savedFlows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No saved flows yet. Build a flow and use “Save to Library”.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {savedFlows.map((f: any) => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border p-2 hover-elevate" data-testid={`saved-flow-${f.id}`}>
                  <Workflow className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">{f.nodeCount} steps · {f.edgeCount} connections · {f.updatedAt ? new Date(f.updatedAt).toLocaleDateString() : ""}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => loadFlowMutation.mutate(f.id)} disabled={loadFlowMutation.isPending} data-testid={`button-load-flow-${f.id}`}>Load</Button>
                  <button type="button" onClick={() => deleteFlowMutation.mutate(f.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0" data-testid={`button-delete-flow-${f.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={syncLegacyChoiceOpen} onOpenChange={setSyncLegacyChoiceOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-sync-legacy-choice">
          <DialogHeader>
            <DialogTitle>This automation predates edit-tracking</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Its current agents can't be matched to specific process-flow steps, so I can't tell what changed.
            Rebuild it fully — every current step gets a fresh agent, and the existing ones are superseded — or skip syncing for now.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncLegacyChoiceOpen(false)} data-testid="button-skip-sync">Skip for now</Button>
            <Button
              onClick={() => { setSyncLegacyChoiceOpen(false); syncMutation.mutate(true); }}
              disabled={syncMutation.isPending}
              data-testid="button-full-rebuild-sync"
            >
              {syncMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-1.5" />}
              Rebuild fully
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncResultOpen} onOpenChange={setSyncResultOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-sync-result">
          <DialogHeader><DialogTitle>Sync complete</DialogTitle></DialogHeader>
          {syncResult && (
            <div className="flex flex-col gap-3 text-sm">
              <p className="text-muted-foreground">{syncResult.unchanged} step{syncResult.unchanged !== 1 ? "s" : ""} unchanged — nothing touched.</p>
              {syncResult.changed?.length > 0 && (
                <div>
                  <p className="font-medium text-xs mb-1">Regenerated</p>
                  <div className="flex flex-wrap gap-1">{syncResult.changed.map((l: string) => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}</div>
                </div>
              )}
              {syncResult.added?.length > 0 && (
                <div>
                  <p className="font-medium text-xs mb-1">Added</p>
                  <div className="flex flex-wrap gap-1">{syncResult.added.map((l: string) => <Badge key={l} variant="secondary" className="text-[10px]">{l}</Badge>)}</div>
                </div>
              )}
              {syncResult.superseded?.length > 0 && (
                <div>
                  <p className="font-medium text-xs mb-1">Superseded — retire manually when ready</p>
                  <div className="flex flex-wrap gap-1">{syncResult.superseded.map((s: any) => <Badge key={s.agentId} variant="outline" className="text-[10px]">{s.label}</Badge>)}</div>
                </div>
              )}
              {syncResult.draftFailures?.length > 0 && (
                <p className="text-[11px] text-destructive">Failed to draft: {syncResult.draftFailures.map((f: any) => f.label).join(", ")} — retry the sync to pick these up.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
