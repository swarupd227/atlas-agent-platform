import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Agent, AgentPrompt, EvalDataset, EvalMetricCollection, EvalExperiment } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
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
  Bot,
  GitBranch,
  Plus,
  CheckCircle,
  Clock,
  FlaskConical,
  ChevronRight,
  Copy,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  BarChart3,
  Check,
  X,
} from "lucide-react";
import { formatDate } from "@/components/shared-utils";

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  text: string;
  lineNum: number;
}

function computeDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const result: DiffLine[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i] ?? "";
    const bLine = bLines[i] ?? "";
    if (aLine === bLine) {
      result.push({ type: "unchanged", text: aLine, lineNum: i + 1 });
    } else {
      if (i < aLines.length) result.push({ type: "removed", text: aLine, lineNum: i + 1 });
      if (i < bLines.length) result.push({ type: "added", text: bLine, lineNum: i + 1 });
    }
  }
  return result;
}

function DiffViewer({ a, b, aLabel, bLabel }: { a: string; b: string; aLabel: string; bLabel: string }) {
  const diff = useMemo(() => computeDiff(a, b), [a, b]);
  return (
    <div className="grid grid-cols-2 gap-2 text-xs font-mono border rounded-md overflow-hidden">
      <div className="bg-muted/30 border-r">
        <div className="px-3 py-1.5 bg-muted/60 text-muted-foreground font-sans text-[11px] font-medium border-b">{aLabel}</div>
        <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
          {diff.filter(l => l.type !== "added").map((l, i) => (
            <div key={i} className={`px-1.5 py-0.5 rounded-sm whitespace-pre-wrap break-all ${l.type === "removed" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
              <span className="opacity-40 mr-2 select-none">{l.lineNum}</span>{l.text || " "}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-muted/30">
        <div className="px-3 py-1.5 bg-muted/60 text-muted-foreground font-sans text-[11px] font-medium border-b">{bLabel}</div>
        <div className="p-2 space-y-0.5 max-h-64 overflow-y-auto">
          {diff.filter(l => l.type !== "removed").map((l, i) => (
            <div key={i} className={`px-1.5 py-0.5 rounded-sm whitespace-pre-wrap break-all ${l.type === "added" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
              <span className="opacity-40 mr-2 select-none">{l.lineNum}</span>{l.text || " "}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EvalPrompts() {
  const { toast } = useToast();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showNewPromptDialog, setShowNewPromptDialog] = useState(false);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [showExperimentDialog, setShowExperimentDialog] = useState(false);
  const [showExperimentResultsDialog, setShowExperimentResultsDialog] = useState(false);
  const [diffVersions, setDiffVersions] = useState<{ a: AgentPrompt; b: AgentPrompt } | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<EvalExperiment | null>(null);
  const [newPromptContent, setNewPromptContent] = useState("");
  const [newPromptNote, setNewPromptNote] = useState("");
  const [experimentForm, setExperimentForm] = useState({
    name: "",
    datasetId: "",
    metricCollectionId: "",
    judgeModel: "",
    variants: [] as number[],
  });

  const { data: agents, isLoading: agentsLoading } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: datasets } = useQuery<EvalDataset[]>({ queryKey: ["/api/eval/datasets"] });
  const { data: collections } = useQuery<EvalMetricCollection[]>({ queryKey: ["/api/eval/metric-collections"] });
  const { data: experiments } = useQuery<EvalExperiment[]>({
    queryKey: ["/api/eval/experiments", selectedAgentId],
    enabled: !!selectedAgentId,
  });

  const { data: prompts, isLoading: promptsLoading } = useQuery<AgentPrompt[]>({
    queryKey: ["/api/agents", selectedAgentId, "prompts"],
    enabled: !!selectedAgentId,
  });

  const selectedAgent = useMemo(() => agents?.find(a => a.id === selectedAgentId), [agents, selectedAgentId]);

  const createPrompt = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/agents/${selectedAgentId}/prompts`, {
        content: newPromptContent,
        changeNote: newPromptNote || undefined,
        createdBy: "user",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", selectedAgentId, "prompts"] });
      setShowNewPromptDialog(false);
      setNewPromptContent("");
      setNewPromptNote("");
      toast({ title: "Prompt version created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const promotePrompt = useMutation({
    mutationFn: async (version: number) => {
      return apiRequest("POST", `/api/agents/${selectedAgentId}/prompts/${version}/promote`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents", selectedAgentId, "prompts"] });
      toast({ title: "Prompt promoted to active" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createExperiment = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/eval/experiments", {
        agentId: selectedAgentId,
        name: experimentForm.name,
        datasetId: experimentForm.datasetId,
        metricCollectionId: experimentForm.metricCollectionId || undefined,
        judgeModelOverride: experimentForm.judgeModel || undefined,
        variantPromptVersions: experimentForm.variants,
        createdBy: "user",
      });
    },
    onSuccess: (exp: EvalExperiment) => {
      queryClient.invalidateQueries({ queryKey: ["/api/eval/experiments", selectedAgentId] });
      setShowExperimentDialog(false);
      setExperimentForm({ name: "", datasetId: "", metricCollectionId: "", judgeModel: "", variants: [] });
      toast({ title: "Experiment started", description: "Results will be ready in a moment" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/eval/experiments", selectedAgentId] });
      }, 3000);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const agentsWithPrompts = useMemo(() => agents ?? [], [agents]);

  const sortedPrompts = useMemo(() => [...(prompts ?? [])].sort((a, b) => b.version - a.version), [prompts]);
  const activePrompt = sortedPrompts.find(p => p.isActive);

  function openDiff(versionA: AgentPrompt, versionB: AgentPrompt) {
    setDiffVersions({ a: versionA, b: versionB });
    setShowDiffDialog(true);
  }

  function toggleVariant(version: number) {
    setExperimentForm(f => ({
      ...f,
      variants: f.variants.includes(version)
        ? f.variants.filter(v => v !== version)
        : f.variants.length < 4 ? [...f.variants, version] : f.variants,
    }));
  }

  const resultEntries = useMemo(() => {
    if (!selectedExperiment?.results) return [];
    return Object.entries(selectedExperiment.results as Record<string, any>)
      .sort(([, a], [, b]) => b.passRate - a.passRate);
  }, [selectedExperiment]);

  return (
    <div className="flex h-full">
      {/* Left agent rail */}
      <div className="w-64 border-r flex flex-col shrink-0">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-primary" />
            Prompt Registry
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select an agent to manage prompts</p>
        </div>
        <ScrollArea className="flex-1">
          {agentsLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {agentsWithPrompts.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgentId(agent.id)}
                  data-testid={`button-agent-${agent.id}`}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-left transition-colors text-sm ${selectedAgentId === agent.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"}`}
                >
                  <Bot className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{agent.name}</span>
                  <ChevronRight className="w-3 h-3 ml-auto shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Center: Prompt version list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedAgentId ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <GitBranch className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select an agent to view its prompt history</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h1 className="text-base font-semibold flex items-center gap-2" data-testid="heading-prompt-library">
                  <GitBranch className="w-4 h-4 text-primary" />
                  {selectedAgent?.name ?? "Agent"} — Prompt Versions
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sortedPrompts.length} version{sortedPrompts.length !== 1 ? "s" : ""} · {activePrompt ? `v${activePrompt.version} active` : "No active version"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" data-testid="button-run-experiment" onClick={() => setShowExperimentDialog(true)} disabled={sortedPrompts.length < 2}>
                  <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
                  Run A/B Experiment
                </Button>
                <Button size="sm" data-testid="button-new-prompt" onClick={() => setShowNewPromptDialog(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Version
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {promptsLoading ? (
                  [1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)
                ) : sortedPrompts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Sparkles className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No prompt versions yet</p>
                    <Button size="sm" onClick={() => setShowNewPromptDialog(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      Add First Version
                    </Button>
                  </div>
                ) : (
                  sortedPrompts.map((prompt, idx) => {
                    const prev = sortedPrompts[idx + 1];
                    return (
                      <Card key={prompt.id} data-testid={`card-prompt-v${prompt.version}`} className={`transition-shadow ${prompt.isActive ? "ring-1 ring-primary/30" : ""}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-semibold">v{prompt.version}</span>
                                {prompt.isActive && (
                                  <Badge className="text-[10px] py-0 px-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" data-testid={`badge-active-v${prompt.version}`}>
                                    <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                    Active
                                  </Badge>
                                )}
                                {prompt.changeNote && (
                                  <span className="text-xs text-muted-foreground italic truncate max-w-xs">{prompt.changeNote}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(prompt.createdAt as string)}</span>
                                <span>by {prompt.createdBy}</span>
                                {prompt.sha256 && <span className="font-mono">{prompt.sha256.slice(0, 8)}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 line-clamp-2 font-mono">
                                {prompt.content}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {!prompt.isActive && (
                                <Button variant="outline" size="sm" className="text-xs h-7" data-testid={`button-promote-v${prompt.version}`}
                                  onClick={() => promotePrompt.mutate(prompt.version)}
                                  disabled={promotePrompt.isPending}>
                                  <TrendingUp className="w-3 h-3 mr-1" />
                                  Promote
                                </Button>
                              )}
                              {prev && (
                                <Button variant="ghost" size="sm" className="text-xs h-7" data-testid={`button-diff-v${prompt.version}`}
                                  onClick={() => openDiff(prev, prompt)}>
                                  <GitBranch className="w-3 h-3 mr-1" />
                                  Diff
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="text-xs h-7"
                                onClick={() => { navigator.clipboard.writeText(prompt.content); toast({ title: "Copied" }); }}>
                                <Copy className="w-3 h-3 mr-1" />
                                Copy
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}

                {/* Experiment History */}
                {(experiments ?? []).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">A/B Experiment History</h3>
                    <div className="space-y-2">
                      {(experiments ?? []).map(exp => (
                        <Card key={exp.id} data-testid={`card-experiment-${exp.id}`} className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => { setSelectedExperiment(exp); setShowExperimentResultsDialog(true); }}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <FlaskConical className="w-4 h-4 text-violet-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium truncate">{exp.name}</span>
                                <Badge variant="outline" className={`text-[10px] py-0 px-1.5 ${exp.status === "completed" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : exp.status === "running" ? "bg-blue-500/10 text-blue-700" : "bg-red-500/10 text-red-700"}`}>
                                  {exp.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Variants: v{(exp.variantPromptVersions ?? []).join(", v")} · {formatDate(exp.startedAt as string)}
                              </p>
                            </div>
                            {exp.winnerVersion && (
                              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px]">
                                Winner: v{exp.winnerVersion}
                              </Badge>
                            )}
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* New Prompt Dialog */}
      <Dialog open={showNewPromptDialog} onOpenChange={setShowNewPromptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Prompt Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prompt Content</Label>
              <Textarea
                data-testid="textarea-prompt-content"
                value={newPromptContent}
                onChange={e => setNewPromptContent(e.target.value)}
                className="mt-1 font-mono text-sm min-h-[200px]"
                placeholder="You are a helpful assistant..."
              />
            </div>
            <div>
              <Label>Change Note (optional)</Label>
              <Input
                data-testid="input-change-note"
                value={newPromptNote}
                onChange={e => setNewPromptNote(e.target.value)}
                className="mt-1"
                placeholder="Improved instruction clarity, added role description..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPromptDialog(false)}>Cancel</Button>
            <Button data-testid="button-create-prompt" onClick={() => createPrompt.mutate()} disabled={!newPromptContent.trim() || createPrompt.isPending}>
              {createPrompt.isPending ? "Creating..." : "Create Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff Dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Prompt Diff
            </DialogTitle>
          </DialogHeader>
          {diffVersions && (
            <DiffViewer
              a={diffVersions.a.content}
              b={diffVersions.b.content}
              aLabel={`v${diffVersions.a.version} (previous)`}
              bLabel={`v${diffVersions.b.version} (current)`}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDiffDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Experiment Builder Dialog */}
      <Dialog open={showExperimentDialog} onOpenChange={setShowExperimentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-violet-500" />
              A/B Experiment Builder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Experiment Name</Label>
              <Input data-testid="input-experiment-name" value={experimentForm.name} onChange={e => setExperimentForm(f => ({ ...f, name: e.target.value }))} className="mt-1" placeholder="e.g. Role clarity v1 vs v2" />
            </div>
            <div>
              <Label>Select Prompt Variants (2–4)</Label>
              <div className="mt-1.5 space-y-1.5">
                {sortedPrompts.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ${experimentForm.variants.includes(p.version) ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                    <input type="checkbox" checked={experimentForm.variants.includes(p.version)} onChange={() => toggleVariant(p.version)} className="rounded" data-testid={`checkbox-variant-v${p.version}`} />
                    <span className="text-sm font-medium">v{p.version}</span>
                    {p.isActive && <Badge className="text-[10px] py-0 px-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">Active</Badge>}
                    {p.changeNote && <span className="text-xs text-muted-foreground truncate">{p.changeNote}</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{experimentForm.variants.length} selected</p>
            </div>
            <div>
              <Label>Dataset</Label>
              <Select value={experimentForm.datasetId} onValueChange={v => setExperimentForm(f => ({ ...f, datasetId: v }))}>
                <SelectTrigger data-testid="select-dataset" className="mt-1">
                  <SelectValue placeholder="Select a dataset..." />
                </SelectTrigger>
                <SelectContent>
                  {(datasets ?? []).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric Collection (optional)</Label>
              <Select value={experimentForm.metricCollectionId} onValueChange={v => setExperimentForm(f => ({ ...f, metricCollectionId: v }))}>
                <SelectTrigger data-testid="select-metric-collection" className="mt-1">
                  <SelectValue placeholder="Select a collection..." />
                </SelectTrigger>
                <SelectContent>
                  {(collections ?? []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Judge Model Override (optional)</Label>
              <Input value={experimentForm.judgeModel} onChange={e => setExperimentForm(f => ({ ...f, judgeModel: e.target.value }))} className="mt-1" placeholder="claude-sonnet-4-5 (default)" />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
              Each variant will run on the selected dataset and metrics in parallel. Statistical significance (p &lt; 0.05, two-tailed paired t-test) is computed after completion.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExperimentDialog(false)}>Cancel</Button>
            <Button data-testid="button-run-experiment-confirm" onClick={() => createExperiment.mutate()}
              disabled={!experimentForm.name || !experimentForm.datasetId || experimentForm.variants.length < 2 || createExperiment.isPending}>
              {createExperiment.isPending ? "Starting..." : "Run Experiment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Experiment Results Dialog */}
      <Dialog open={showExperimentResultsDialog} onOpenChange={setShowExperimentResultsDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-500" />
              {selectedExperiment?.name} — Results
            </DialogTitle>
          </DialogHeader>
          {selectedExperiment && (
            <div className="space-y-4">
              {selectedExperiment.status !== "completed" ? (
                <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
                  <FlaskConical className="w-5 h-5 animate-pulse" />
                  <span className="text-sm">{selectedExperiment.status === "running" ? "Experiment running…" : "Experiment failed"}</span>
                </div>
              ) : (
                <>
                  {/* Variant comparison table */}
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Metric</th>
                          {resultEntries.map(([key, v]: any) => (
                            <th key={key} className="text-center px-3 py-2 text-xs font-medium">
                              <span className="flex items-center justify-center gap-1">
                                v{v.variantVersion}
                                {selectedExperiment.winnerVersion === v.variantVersion && (
                                  <Badge className="text-[10px] py-0 px-1 bg-amber-500/10 text-amber-700 dark:text-amber-400">Winner</Badge>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          { label: "Pass Rate", key: "passRate", fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
                          { label: "Mean Score", key: "meanScore", fmt: (v: number) => v.toFixed(3) },
                          { label: "Std Dev", key: "stdDev", fmt: (v: number) => `±${v.toFixed(3)}` },
                          { label: "Cost (USD)", key: "costUsd", fmt: (v: number) => `$${v.toFixed(4)}` },
                          { label: "Avg Latency", key: "avgLatencyMs", fmt: (v: number) => `${v}ms` },
                        ].map(row => (
                          <tr key={row.label} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 text-xs text-muted-foreground font-medium">{row.label}</td>
                            {resultEntries.map(([key, v]: any, i: number) => {
                              const val = v[row.key];
                              const isWinner = i === 0;
                              return (
                                <td key={key} className={`px-3 py-2 text-center text-xs font-mono ${isWinner && row.key === "passRate" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : ""}`}>
                                  {val != null ? row.fmt(val) : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Significance results */}
                  {selectedExperiment.significanceResults && Object.entries(selectedExperiment.significanceResults as any).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statistical Significance</h4>
                      {Object.entries(selectedExperiment.significanceResults as Record<string, any>).map(([pair, sig]) => (
                        <div key={pair} className={`flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm ${sig.significant ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/30"}`}>
                          {sig.significant ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <X className="w-4 h-4 text-muted-foreground shrink-0" />}
                          <div className="flex-1">
                            <span className={`font-medium ${sig.significant ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>{sig.label}</span>
                            <span className="text-xs text-muted-foreground ml-2">({pair.replace(/_vs_/g, " vs ")})</span>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            p={sig.pValue} · d={sig.effectSize}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Promote winner CTA */}
                  {selectedExperiment.winnerVersion && (
                    <div className="flex items-center justify-between p-3 rounded-md bg-amber-500/5 border border-amber-500/20">
                      <div className="text-sm">
                        <span className="font-medium">Recommended: Promote v{selectedExperiment.winnerVersion}</span>
                        <span className="text-muted-foreground ml-2 text-xs">Highest pass rate among variants</span>
                      </div>
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" data-testid="button-promote-winner"
                        onClick={() => { promotePrompt.mutate(selectedExperiment.winnerVersion!); setShowExperimentResultsDialog(false); }}>
                        <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
                        Promote Winner
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExperimentResultsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
