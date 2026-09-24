import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Workflow, Zap, Users, Brain, Bell, Square,
  Trash2, ArrowRight, ChevronRight, Sparkles, Loader2,
  Play, Database, GitBranch, Save, Mic, MicOff, FolderOpen, AlertTriangle, CheckCircle2,
  Maximize2, Minimize2, X,
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
import { normalizeToGraph, layoutGraph, type ProcessNode, type ProcessEdge } from "@shared/process-flow";
import FlowGraphCanvas, { type FlowIssue } from "@/components/flow-graph-canvas";
import { TeamProposalDialog } from "@/components/team-proposal-flow";


// Small, well-formed starter flows for the empty state — so "pick a template"
// is a real one-click path to a good-looking flow, not a dead reference. Each
// is intentionally complete (trigger -> ... -> end, with a conditioned
// decision) so it validates clean and demos well immediately.
const STARTER_TEMPLATES: Array<{ key: string; name: string; blurb: string; nodes: ProcessNode[]; edges: ProcessEdge[] }> = [
  {
    key: "invoice",
    name: "Invoice Approval",
    blurb: "Approve & pay supplier invoices, with a manager gate over a threshold.",
    nodes: [
      { id: "t", type: "trigger", label: "Invoice received" },
      { id: "x", type: "get_info", label: "Match to purchase order" },
      { id: "d", type: "make_decision", label: "Over $10K?" },
      { id: "a", type: "expert_approval", label: "Manager approval" },
      { id: "p", type: "take_action", label: "Schedule payment" },
      { id: "n", type: "send_notification", label: "Notify supplier" },
      { id: "e", type: "end", label: "Done" },
    ],
    edges: [
      { id: "e1", from: "t", to: "x" },
      { id: "e2", from: "x", to: "d" },
      { id: "e3", from: "d", to: "a", label: "Over $10K", condition: "amount > 10000" },
      { id: "e4", from: "d", to: "p", label: "$10K or under", condition: "amount <= 10000" },
      { id: "e5", from: "a", to: "p" },
      { id: "e6", from: "p", to: "n" },
      { id: "e7", from: "n", to: "e" },
    ],
  },
  {
    key: "triage",
    name: "Support Ticket Triage",
    blurb: "Classify a ticket, escalate the urgent ones, auto-reply the rest.",
    nodes: [
      { id: "t", type: "trigger", label: "Ticket submitted" },
      { id: "c", type: "ai_reasoning", label: "Classify urgency" },
      { id: "d", type: "make_decision", label: "Urgent?" },
      { id: "esc", type: "take_action", label: "Escalate & page on-call" },
      { id: "ai", type: "take_action", label: "AI drafts reply" },
      { id: "close", type: "take_action", label: "Close ticket" },
      { id: "e", type: "end", label: "Resolved" },
    ],
    edges: [
      { id: "e1", from: "t", to: "c" },
      { id: "e2", from: "c", to: "d" },
      { id: "e3", from: "d", to: "esc", label: "Urgent", condition: "urgency is high" },
      { id: "e4", from: "d", to: "ai", label: "Not urgent", condition: "urgency is not high" },
      { id: "e5", from: "esc", to: "close" },
      { id: "e6", from: "ai", to: "close" },
      { id: "e7", from: "close", to: "e" },
    ],
  },
  {
    key: "returns",
    name: "Returns & Refunds",
    blurb: "Validate a return window, inspect the item, refund or offer credit.",
    nodes: [
      { id: "t", type: "trigger", label: "Return requested" },
      { id: "w", type: "make_decision", label: "Within 30 days?" },
      { id: "rej", type: "send_notification", label: "Reject with reason" },
      { id: "insp", type: "get_info", label: "Inspect returned item" },
      { id: "cond", type: "make_decision", label: "Resellable?" },
      { id: "refund", type: "take_action", label: "Full refund" },
      { id: "credit", type: "take_action", label: "Store credit" },
      { id: "e", type: "end", label: "Case closed" },
    ],
    edges: [
      { id: "e1", from: "t", to: "w" },
      { id: "e2", from: "w", to: "rej", label: "Outside window", condition: "days_since_order > 30" },
      { id: "e3", from: "w", to: "insp", label: "Within window", condition: "days_since_order <= 30" },
      { id: "e4", from: "insp", to: "cond" },
      { id: "e5", from: "cond", to: "refund", label: "Resellable", condition: "item is resellable" },
      { id: "e6", from: "cond", to: "credit", label: "Damaged", condition: "item is damaged" },
      { id: "e7", from: "rej", to: "e" },
      { id: "e8", from: "refund", to: "e" },
      { id: "e9", from: "credit", to: "e" },
    ],
  },
];

// Staged status lines shown while the AI drafts a flow, so the ~6s round-trip
// reads as visible progress instead of a blank canvas.
// A question the studio asks before drawing (server/process-flow-clarify.ts).
interface ClarifyQuestion { id: string; question: string; why: string; options: string[] }

// Overlays on the canvas start past the step palette (FlowGraphCanvas's left rail).
const PALETTE_OFFSET = "left-[76px]";

const GEN_MESSAGES = ["Reading your description…", "Drafting the steps…", "Wiring up the branches…", "Laying it out cleanly…"];

export default function ProcessFlows() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const urlParams = useMemo(() => {
    const p = new URLSearchParams(searchString);
    return {
      outcomeId: p.get("outcomeId") || "",
      outcomeName: p.get("outcomeName") || "",
      kpis: p.get("kpis") || "",
      // Deep link from the Journey Library: open this saved flow, and keep the
      // journey it belongs to so a save preserves the link.
      flowId: p.get("flowId") || "",
      teamAgentId: p.get("teamAgentId") || "",
    };
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
  // Replace with a clean auto-laid-out graph — used for every "fresh graph"
  // moment (AI generate, template, library load) so the flow lands as a tidy
  // left-to-right diagram instead of an index-based grid.
  const replaceLaidOut = (g: { nodes: ProcessNode[]; edges: ProcessEdge[] }) =>
    replaceGraph({ nodes: layoutGraph(g.nodes, g.edges), edges: g.edges });

  const [aiDescription, setAiDescription] = useState(() => urlParams.outcomeName || "");
  const [aiFiles, setAiFiles] = useState<AttachedFile[]>([]);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  // Long procedures need room: the describe panel can grow to the canvas height.
  const [describeExpanded, setDescribeExpanded] = useState(false);
  // Full-viewport canvas. Header, AI panel and toolbar together leave little
  // room for a 9-node graph; this lifts the editor out of the page shell
  // without disturbing any of the layout beneath it.
  const [canvasExpanded, setCanvasExpanded] = useState(false);
  const [flowName, setFlowName] = useState(() => urlParams.outcomeName ? `${urlParams.outcomeName} Flow` : "");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [genMsgIdx, setGenMsgIdx] = useState(0);

  const outcomeContext = urlParams.outcomeName
    ? { name: urlParams.outcomeName, kpis: urlParams.kpis.split(",").filter(Boolean).map(k => ({ name: k.trim() })) }
    : undefined;

  // Clarifying questions: before drawing, the studio asks about gaps that would
  // change the flow's shape (a threshold with no value, an approval with no
  // approver...). Null = not asked yet; the person can always skip.
  const [clarify, setClarify] = useState<{ questions: ClarifyQuestion[]; answers: Record<string, string> } | null>(null);
  // What the person told the studio for the flow currently drawn -- shown under the name.
  const [drawnFrom, setDrawnFrom] = useState<Array<{ question: string; answer: string }>>([]);

  const generateMutation = useMutation({
    mutationFn: async ({ description, clarifications = [] }: { description: string; clarifications?: Array<{ question: string; answer: string }> }) => {
      const res = await apiRequest("POST", "/api/ai/generate-process-flow", {
        description,
        ...(outcomeContext ? { outcomeContext } : {}),
        fileIds: aiFiles.map(f => f.id),
        ...(clarifications.length ? { clarifications } : {}),
      });
      return res.json();
    },
    onSuccess: (data, vars) => {
      setClarify(null);
      setDrawnFrom(Array.isArray(data.clarifications) ? data.clarifications : (vars.clarifications || []));
      // Server now returns a real graph (nodes + edges, branches included)
      // rather than a flat step list -- normalizeToGraph handles both shapes,
      // so this also stays compatible if an older cached response ever shows up.
      const g = normalizeToGraph(data, data.name || "Generated Flow");
      if (g && g.nodes.length > 0) {
        replaceLaidOut({ nodes: g.nodes, edges: g.edges });
        setFlowName(data.name || "Generated Flow");
        toast({ title: "Process flow generated" });
        // The describe panel has done its job; leaving it open squeezed the
        // canvas into a ~200px strip on a 1080p screen. Collapse it so the
        // generated graph gets the viewport -- "Describe Workflow" reopens it
        // with the text intact.
        setAiPanelOpen(false);
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

  const clarifyMutation = useMutation({
    mutationFn: async (description: string) => {
      const res = await apiRequest("POST", "/api/ai/process-flow/clarify", {
        description,
        ...(outcomeContext ? { outcomeContext } : {}),
        fileIds: aiFiles.map(f => f.id),
      });
      return res.json() as Promise<{ ready: boolean; questions: ClarifyQuestion[] }>;
    },
    onSuccess: (data, description) => {
      if (!data.questions?.length) { generateMutation.mutate({ description }); return; }
      setClarify({ questions: data.questions, answers: {} });
    },
    // Checking must never stand between someone and their flow: on any failure, just draw.
    onError: (_e, description) => generateMutation.mutate({ description }),
  });

  // "Generate Flow": ask first, unless the questions are already on screen.
  const startGenerate = () => {
    if (clarify) { drawWithAnswers(); return; }
    clarifyMutation.mutate(aiDescription);
  };
  const drawWithAnswers = (skip = false) => {
    const clarifications = skip || !clarify ? [] : clarify.questions
      .map(q => ({ question: q.question, answer: (clarify.answers[q.id] || "").trim() }))
      .filter(c => c.answer);
    generateMutation.mutate({ description: aiDescription, clarifications });
  };
  const setAnswer = (id: string, answer: string) =>
    setClarify(c => (c ? { ...c, answers: { ...c.answers, [id]: answer } } : c));

  // Advance the generation status line while the draft is in flight.
  useEffect(() => {
    if (!generateMutation.isPending) { setGenMsgIdx(0); return; }
    const t = setInterval(() => setGenMsgIdx(i => Math.min(i + 1, GEN_MESSAGES.length - 1)), 1500);
    return () => clearInterval(t);
  }, [generateMutation.isPending]);

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
      const body = {
        name,
        nodes: graph.nodes,
        edges: graph.edges,
        // Preserve the journey this flow belongs to when the studio was opened
        // from the Journey Library, so saving does not orphan it.
        ...(urlParams.teamAgentId ? { teamAgentId: urlParams.teamAgentId } : {}),
      };
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

  // Deep link from the Journey Library: load the journey own flow on open.
  const deepLinkLoadedRef = useRef<string | null>(null);

  const loadFlowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("GET", `/api/process-flows/${id}`);
      return res.json();
    },
    onSuccess: (rec) => {
      const g = normalizeToGraph(rec.graph, rec.name || "Process Flow");
      if (g && g.nodes.length > 0) {
        replaceLaidOut({ nodes: g.nodes, edges: g.edges });
        setFlowName(rec.name || g.name || "Process Flow");
        setSavedFlowId(rec.id);
        setValidationIssues([]);
        setDrawnFrom([]);
        setLibraryOpen(false);
        toast({ title: "Flow loaded" });
      }
    },
    onError: () => toast({ title: "Could not load that flow", variant: "destructive" }),
  });

  // Opened from the Journey Library with ?flowId= — load that flow once, so a
  // journey can show its own process design rather than sending the user to
  // hunt for it in the library.
  useEffect(() => {
    const id = urlParams.flowId;
    if (!id || deepLinkLoadedRef.current === id) return;
    deepLinkLoadedRef.current = id;
    loadFlowMutation.mutate(id);
    // loadFlowMutation is stable for the component's lifetime; re-running on
    // its identity would reload the flow and discard in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams.flowId]);

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
  // Where dictation lands: the description, or the answer to a clarifying question.
  const voiceTargetRef = useRef<string | null>(null);
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
      if (!chunk) return;
      const target = voiceTargetRef.current;
      if (target) setClarify(c => (c ? { ...c, answers: { ...c.answers, [target]: ((c.answers[target] || "").trimEnd() + " " + chunk.trim()).trim() } } : c));
      else setAiDescription(prev => (prev ? prev.trimEnd() + " " : "") + chunk.trim());
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
    () => graph.nodes.map(n => ({ id: n.id, type: n.type, label: n.label, description: n.description, actor: n.actor, config: n.config })),
    [graph.nodes],
  );
  // The connections, not just the steps. Sending the steps alone left the
  // drafting side to re-infer the graph from prose, and when it didn't, the
  // team was built as a flat fan-out: every agent in one parallel wave, with
  // the decisions, sign-off ordering and rework loops silently gone.
  const proposalEdges = useMemo(
    () => graph.edges.map(e => ({ from: e.from, to: e.to, label: e.label, condition: e.condition, maxRounds: e.maxRounds })),
    [graph.edges],
  );

  const approvalCount = graph.nodes.filter(n => n.type === "expert_approval").length;
  const decisionCount = graph.nodes.filter(n => n.type === "make_decision").length;
  const wordCount = aiDescription.trim() ? aiDescription.trim().split(/\s+/).length : 0;
  const describeOpen = aiPanelOpen && !generateMutation.isPending;
  const checking = clarifyMutation.isPending;
  const answeredCount = clarify ? clarify.questions.filter(q => (clarify.answers[q.id] || "").trim()).length : 0;

  return (
    <div className="astra-scope flex flex-col h-full bg-background text-foreground font-sans" data-testid="page-process-flows">
      {/* Header: what this flow is, then every action on it. Actions wrap onto a
          second line on narrow screens instead of crushing the title. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-5 pt-4 pb-3 shrink-0">
        <div className="min-w-[260px] flex-1">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Process flow</span>
          {nodeCount > 0 ? (
            <Input
              value={flowName}
              onChange={e => setFlowName(e.target.value)}
              className="mt-0.5 h-auto max-w-[640px] border-transparent bg-transparent px-1 -mx-1 py-0.5 font-[family-name:var(--astra-display)] text-2xl md:text-2xl font-semibold tracking-tight shadow-none hover:border-border focus-visible:border-border"
              placeholder="Name this flow…"
              aria-label="Flow name"
              data-testid="input-flow-name"
            />
          ) : (
            <h1 className="mt-0.5 font-[family-name:var(--astra-display)] text-2xl font-semibold tracking-tight">Process Flow Studio</h1>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
            {nodeCount > 0 ? (
              <>
                <span>{nodeCount} steps</span>
                <span>{graph.edges.length} connections</span>
                {decisionCount > 0 && <span>{decisionCount} decision{decisionCount !== 1 ? "s" : ""}</span>}
                {approvalCount > 0 && <span>{approvalCount} approval{approvalCount !== 1 ? "s" : ""}</span>}
                {totalMins > 0 && <span>{totalMins >= 60 ? `~${Math.round(totalMins / 60)}h` : `~${totalMins}m`} total</span>}
                {linkedTeamAgent && <span>runs as <a href={`/agents/teams/${linkedTeamAgent.id}`} className="text-foreground underline underline-offset-2">{linkedTeamAgent.name}</a></span>}
                <span>{savedFlowId ? "saved in library" : "not saved yet"}</span>
                {drawnFrom.length > 0 && (
                  <details className="group relative font-sans" data-testid="details-drawn-from">
                    <summary className="cursor-pointer list-none text-foreground underline decoration-dotted underline-offset-2">
                      based on {drawnFrom.length} answer{drawnFrom.length !== 1 ? "s" : ""}
                    </summary>
                    <ul className="absolute left-0 top-6 z-40 flex w-[420px] max-w-[80vw] flex-col gap-2 rounded-lg border bg-card p-3 text-xs shadow-lg">
                      {drawnFrom.map((c, i) => (
                        <li key={i}><span className="text-muted-foreground">{c.question}</span><br /><span className="font-medium text-foreground">{c.answer}</span></li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <span className="font-sans text-sm">Describe how a process runs and the studio draws it. For a goal you're accountable for, start from Outcomes instead.</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 [&_button]:shrink-0">
          <Button
            size="sm"
            variant={aiPanelOpen ? "secondary" : "outline"}
            onClick={() => setAiPanelOpen(v => !v)}
            aria-pressed={aiPanelOpen}
            data-testid="button-toggle-ai-panel"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Describe workflow
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLibraryOpen(true)} data-testid="button-open-flow-library">
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
            <Button size="sm" variant="ghost" onClick={() => navigate(`/outcomes/${urlParams.outcomeId}`)} data-testid="button-back-to-outcome">
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
              title="Validate the flow and preview how it would run"
              data-testid="button-validate-flow"
            >
              {compileMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5 mr-1.5" />}
              Check flow
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
      </div>

      {/* Outcome context */}
      {urlParams.outcomeName && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border bg-card px-3 py-2" data-testid="banner-outcome-context">
          <Workflow className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            Designing for outcome: <span className="font-medium text-foreground">{urlParams.outcomeName}</span>
            {urlParams.kpis && <span> · KPIs: {urlParams.kpis}</span>}
          </p>
        </div>
      )}

      {/* Canvas — React Flow graph editor (branch / parallel / loop) */}
      <div
        className={canvasExpanded ? "fixed inset-0 z-50 astra-scope bg-background text-foreground font-sans" : "flex-1 min-h-0 relative border-t"}
        data-testid="flow-canvas-container"
      >
        {/* Describe panel: floats over the canvas with room for a full process
            write-up (grows with the text, resizable, expandable), dictation and
            the source document. It closes once a flow is drawn; reopening keeps
            the text. Rendered first so its textarea is the page's first. */}
        {describeOpen && (
          <div
            className={`absolute left-1/2 top-4 z-30 flex w-[min(760px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[0_12px_40px_hsl(0_0%_0%/0.14)] ${describeExpanded ? "bottom-4" : ""}`}
            role="dialog"
            aria-label="Describe your workflow"
            data-testid="panel-describe-workflow"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--astra-display)] text-base font-semibold">Describe your workflow in plain English</p>
                <p className="text-xs text-muted-foreground">Who does what, in what order, where it branches, who approves. Paste a whole procedure if you have one.</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setDescribeExpanded(v => !v)}
                  title={describeExpanded ? "Shrink" : "Expand to full height"}
                  aria-label={describeExpanded ? "Shrink the description" : "Expand the description"}
                  data-testid="button-expand-describe"
                >
                  {describeExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAiPanelOpen(false)} aria-label="Close" data-testid="button-close-describe">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className={`relative flex flex-col ${describeExpanded ? "flex-1 min-h-0" : ""}`}>
              <Textarea
                value={aiDescription}
                onChange={e => { setAiDescription(e.target.value); if (clarify) setClarify(null); }}
                onFocus={() => { voiceTargetRef.current = null; }}
                onKeyDown={e => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && (aiDescription.trim() || aiFiles.length) && !checking) {
                    e.preventDefault();
                    startGenerate();
                  }
                }}
                placeholder={"e.g. When a new supplier invoice arrives, check it against our purchase order. Invoices over $10K need manager approval; the rest go straight through. Then schedule payment and notify the supplier."}
                className={`bg-background text-sm leading-relaxed ${describeExpanded ? "flex-1 min-h-[240px] resize-none" : "min-h-[168px] max-h-[48vh] resize-y"}`}
                data-testid="input-ai-description"
              />
              {listening && (
                <span className="pointer-events-none absolute right-3 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 font-mono text-[11px] font-medium text-primary-foreground" data-testid="badge-listening">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" /> Listening
                </span>
              )}
            </div>
            <FileAttach
              context="process_flow"
              value={aiFiles}
              onChange={setAiFiles}
              disabled={generateMutation.isPending || checking}
              label="Attach an SOP, runbook or policy"
            />
            {clarify && (
              <div className="flex max-h-[42vh] flex-col gap-3 overflow-y-auto rounded-xl border bg-background p-3" data-testid="panel-clarify">
                <div>
                  <p className="text-sm font-medium">A few details would change how this flow is drawn</p>
                  <p className="text-xs text-muted-foreground">Answer what you can. Anything left blank, the studio decides.</p>
                </div>
                {clarify.questions.map(q => {
                  const answer = clarify.answers[q.id] || "";
                  return (
                    <div key={q.id} className="flex flex-col gap-1.5" data-testid={`clarify-${q.id}`}>
                      <p className="text-sm">{q.question}</p>
                      {q.why && <p className="-mt-1 text-[11px] text-muted-foreground">{q.why}</p>}
                      {q.options.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {q.options.map(o => (
                            <button
                              key={o}
                              type="button"
                              onClick={() => setAnswer(q.id, answer === o ? "" : o)}
                              aria-pressed={answer === o}
                              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${answer === o ? "border-transparent bg-primary text-primary-foreground" : "bg-card hover:border-foreground/40"}`}
                              data-testid={`clarify-option-${q.id}`}
                            >
                              {o}
                            </button>
                          ))}
                        </div>
                      )}
                      <Input
                        value={q.options.includes(answer) ? "" : answer}
                        onChange={e => setAnswer(q.id, e.target.value)}
                        onFocus={() => { voiceTargetRef.current = q.id; }}
                        placeholder={q.options.length ? "Or type your own answer" : "Your answer"}
                        className="h-8 bg-card text-sm"
                        data-testid={`input-clarify-${q.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {clarify
                  ? `${answeredCount} of ${clarify.questions.length} answered`
                  : <>
                      {wordCount > 0 ? `${wordCount} word${wordCount !== 1 ? "s" : ""}` : "Type, dictate, or attach a document"}
                      {aiFiles.length > 0 ? ` · ${aiFiles.length} file${aiFiles.length !== 1 ? "s" : ""}` : ""}
                    </>}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {voiceSupported && (
                  <Button
                    size="sm"
                    variant={listening ? "default" : "outline"}
                    onClick={toggleVoice}
                    aria-pressed={listening}
                    data-testid="button-voice-dictate"
                  >
                    {listening ? <MicOff className="w-3.5 h-3.5 mr-1.5" /> : <Mic className="w-3.5 h-3.5 mr-1.5" />}
                    {listening ? "Stop dictating" : "Dictate"}
                  </Button>
                )}
                {clarify && (
                  <Button size="sm" variant="outline" onClick={() => drawWithAnswers(true)} data-testid="button-clarify-skip">
                    Skip questions, just draw it
                  </Button>
                )}
                {clarify ? (
                  <Button size="sm" onClick={() => drawWithAnswers()} data-testid="button-clarify-draw">
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Draw the flow
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={startGenerate}
                    disabled={(!aiDescription.trim() && !aiFiles.length) || generateMutation.isPending || checking}
                    title="Generate the flow (Ctrl+Enter)"
                    data-testid="button-ai-generate"
                  >
                    {generateMutation.isPending || checking ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                    {checking ? "Checking details…" : "Generate Flow"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <FlowGraphCanvas
          flowKey={`flow-${flowKey}`}
          initialNodes={graph.nodes}
          initialEdges={graph.edges}
          issues={validationIssues}
          onChange={(nodes, edges) => { setGraph({ nodes, edges }); if (validationIssues.length) setValidationIssues([]); }}
          overlay={nodeCount > 0 ? (
            // One place for full screen and clear, in and out of full screen.
            <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg border bg-card/95 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setCanvasExpanded(v => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              data-testid={canvasExpanded ? "button-exit-fullscreen" : "button-expand-canvas"}
            >
              {canvasExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {canvasExpanded ? "Exit full screen" : "Full screen"}
            </button>
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              data-testid="button-clear-flow"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
          ) : null}
        />

        {/* Generation reveal — staged status over the canvas, so the AI
            round-trip feels like progress rather than a frozen blank. */}
        {generateMutation.isPending && (
          <div className={`absolute inset-0 ${PALETTE_OFFSET} flex flex-col items-center justify-center gap-3 bg-background/75 backdrop-blur-sm z-20`} data-testid="generation-overlay">
            <Loader2 className="w-7 h-7 text-foreground animate-spin" />
            <p className="font-[family-name:var(--astra-display)] text-base font-semibold" data-testid="text-generation-status">{GEN_MESSAGES[genMsgIdx]}</p>
            <p className="text-xs text-muted-foreground">Designing your flow from the description…</p>
          </div>
        )}

        {/* Empty state — a real starting point (describe or pick a template)
            instead of a bare grid. Offset past the palette so it stays usable. */}
        {nodeCount === 0 && !generateMutation.isPending && !describeOpen && (
          <div className={`absolute inset-0 ${PALETTE_OFFSET} flex items-center justify-center p-6 pointer-events-none z-10`} data-testid="empty-state">
            <div className="flex w-full max-w-2xl flex-col items-center gap-5 pointer-events-auto">
              <div className="flex flex-col items-center gap-2 text-center">
                <h2 className="font-[family-name:var(--astra-display)] text-xl font-semibold">Start building your process flow</h2>
                <p className="max-w-md text-sm text-muted-foreground">Describe it in plain English, dictate it, or drop in the SOP. Or start from a template, or drag steps in from the left.</p>
              </div>
              <Button onClick={() => setAiPanelOpen(true)} data-testid="button-empty-describe">
                <Sparkles className="w-4 h-4 mr-1.5" />
                Describe your workflow
              </Button>
              <div className="flex w-full flex-col gap-2">
                <span className="text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">or start from a template</span>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                  {STARTER_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.key}
                      type="button"
                      onClick={() => { replaceLaidOut({ nodes: tpl.nodes, edges: tpl.edges }); setFlowName(tpl.name); setSavedFlowId(null); setValidationIssues([]); setDrawnFrom([]); }}
                      className="flex flex-col gap-1 rounded-xl border bg-card p-3 text-left transition-colors hover:border-foreground/40"
                      data-testid={`template-${tpl.key}`}
                    >
                      <span className="text-sm font-medium">{tpl.name}</span>
                      <span className="text-xs leading-snug text-muted-foreground">{tpl.blurb}</span>
                      <span className="mt-1 font-mono text-[11px] text-muted-foreground">{tpl.nodes.length} steps</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={compileOpen} onOpenChange={setCompileOpen}>
        <DialogContent className="astra-scope font-sans max-w-lg" data-testid="dialog-execution-plan">
          <DialogHeader><DialogTitle className="font-[family-name:var(--astra-display)]">Check flow: validation and run plan</DialogTitle></DialogHeader>
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
        processFlowEdges={proposalEdges}
        processFlowId={savedFlowId}
      />

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="astra-scope font-sans max-w-sm" data-testid="dialog-clear-confirm">
          <DialogHeader><DialogTitle>Clear this flow?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes all {nodeCount} step{nodeCount !== 1 ? "s" : ""} and starts over. This can't be undone.
            {savedFlowId ? " Your saved copy in the library is not affected." : ""}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearConfirmOpen(false)} data-testid="button-clear-cancel">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { replaceGraph({ nodes: [], edges: [] }); setFlowName(""); setSavedFlowId(null); setValidationIssues([]); setDrawnFrom([]); setClearConfirmOpen(false); }}
              data-testid="button-clear-confirm"
            >
              Clear flow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="astra-scope font-sans max-w-lg" data-testid="dialog-flow-library">
          <DialogHeader><DialogTitle>Saved process flows</DialogTitle></DialogHeader>
          {!savedFlows ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : savedFlows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No saved flows yet. Build a flow and use “Save to Library”.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {savedFlows.map((f: any) => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border p-2 hover-elevate" data-testid={`saved-flow-${f.id}`}>
                  <Workflow className="w-4 h-4 text-muted-foreground shrink-0" />
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
        <DialogContent className="astra-scope font-sans max-w-md" data-testid="dialog-sync-legacy-choice">
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
        <DialogContent className="astra-scope font-sans max-w-md" data-testid="dialog-sync-result">
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
