/**
 * Agent Workspace — the consumption surface. A person asks an agent to do
 * work, watches it act live, approves the risky step inline, and sees the
 * outcome. Streams from POST /api/workspace/runs/stream; resumes at approval
 * gates via /resume/stream. Every run is governed and produces a signed trace.
 */
import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles, Send, Brain, Wrench, CheckCircle2, ShieldQuestion, XCircle,
  Ban, Loader2, Clock, Receipt, ArrowRight, CircleDollarSign, Download,
  FileText, Pencil, Info, BookOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileAttach, type AttachedFile } from "@/components/file-attach";
import { PENDING_ATTACHMENT_KEY } from "@/lib/pending-attachment";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/ui-vocab";
import { useToast } from "@/hooks/use-toast";

interface WorkspaceAgent {
  id: string; name: string; description: string | null; riskTier: string;
  canGenerateDocuments: boolean;
  documentGenerationMode: "auto" | "platform" | "sandbox";
  ontologyTags: Array<{ conceptId: string; conceptLabel: string }>;
  toolsConfig: Array<{ name?: string; parameters?: Array<{ name: string; enrichedFrom?: string }> }>;
}

/** Maps a raw tool name (as it appears in item.tool / a tool-call mention) to
 *  the ontology concept label it's grounded in. Mirrors agent-playground.tsx's
 *  ontologyLabelMap so the same "[Concept Label]" badge that already exists in
 *  Playground also appears in Workspace -- both surfaces inject the identical
 *  DOMAIN ONTOLOGY glossary into the system prompt, but only Playground showed
 *  the reader that grounding was real. */
function buildOntologyLabelMap(agent: WorkspaceAgent | undefined): Record<string, { displayLabel: string; conceptLabel: string }> {
  const labelMap: Record<string, { displayLabel: string; conceptLabel: string }> = {};
  const tags = Array.isArray(agent?.ontologyTags) ? agent.ontologyTags : [];
  if (tags.length === 0) return labelMap;

  const conceptsByLabel: Record<string, { label: string }> = {};
  for (const tag of tags) {
    const label = tag?.conceptLabel;
    if (typeof label !== "string" || label.trim() === "") continue;
    conceptsByLabel[label.toLowerCase()] = { label };
  }

  const verbMap: Record<string, string> = {
    search: "searched", query: "queried", read: "retrieved data from", write: "updated",
    update: "updated", create: "created record in", send: "sent via", execute: "executed on",
    deploy: "deployed to", process: "processed via", extract: "extracted from", get: "retrieved from",
    fetch: "fetched from", delete: "removed from", validate: "validated against", check: "checked via",
  };

  for (const tool of Array.isArray(agent?.toolsConfig) ? agent!.toolsConfig : []) {
    if (!tool.name) continue;
    const rawName = tool.name;
    const nameParts = rawName.toLowerCase().split("_");

    let bestMatch: { label: string } | null = null;
    const enrichedConcepts = (tool.parameters || []).filter(p => p.enrichedFrom).map(p => p.enrichedFrom!);
    if (enrichedConcepts.length > 0) {
      const found = conceptsByLabel[enrichedConcepts[0].toLowerCase()];
      if (found) bestMatch = found;
    }
    if (!bestMatch) {
      for (const part of nameParts) {
        if (conceptsByLabel[part]) { bestMatch = conceptsByLabel[part]; break; }
      }
    }
    if (!bestMatch) {
      const fullNoVerb = nameParts.slice(1).join(" ");
      if (conceptsByLabel[fullNoVerb]) bestMatch = conceptsByLabel[fullNoVerb];
    }
    if (!bestMatch) {
      for (const part of nameParts) {
        for (const [conceptKey, concept] of Object.entries(conceptsByLabel)) {
          if (part.length > 3 && (conceptKey.includes(part) || part.includes(conceptKey))) { bestMatch = concept; break; }
        }
        if (bestMatch) break;
      }
    }
    if (bestMatch) {
      let matchedVerb = "";
      for (const part of nameParts) {
        if (verbMap[part]) { matchedVerb = verbMap[part]; break; }
      }
      const displayLabel = matchedVerb ? `${matchedVerb} ${bestMatch.label}` : bestMatch.label;
      labelMap[rawName] = { displayLabel, conceptLabel: bestMatch.label };
    }
  }

  return labelMap;
}

function applyOntologyLabels(text: string, labelMap: Record<string, { displayLabel: string; conceptLabel: string }>): string {
  if (Object.keys(labelMap).length === 0) return text;
  let result = text;
  const sortedKeys = Object.keys(labelMap).sort((a, b) => b.length - a.length);
  for (const rawName of sortedKeys) {
    const { displayLabel, conceptLabel } = labelMap[rawName];
    const escaped = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(pattern, `${displayLabel} [${conceptLabel}]`);
  }
  return result;
}

/** Renders text with any "[Concept Label]" markers (from applyOntologyLabels)
 *  as inline badges -- same visual treatment as Playground's RenderTextWithLinks. */
function renderWithOntologyBadges(text: string): ReactNode {
  const regex = /\[([^\]]+)\]/g;
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIdx, match.index);
    if (before) nodes.push(before);
    nodes.push(
      <Badge key={`concept-${match.index}`} variant="secondary" className="text-[9px] text-emerald-600 dark:text-emerald-400 no-default-hover-elevate no-default-active-elevate inline-flex" data-testid="badge-ontology-concept">
        <BookOpen className="w-2.5 h-2.5 mr-0.5" />
        {match[1]}
      </Badge>,
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}
interface GeneratedFileRef { id: string; filename: string | null; mimeType: string | null }
interface MyRun { id: string; agentId: string; status: string; requestText: string; outputSummary: string | null; costUsd: number; traceId: string | null; createdAt: string | null; generatedFiles?: GeneratedFileRef[] }

/** Rough, honest-order-of-magnitude cost, from live measurements during this
 *  feature's build -- not a billing guarantee, just enough to stop "edit this
 *  file" from being a surprise on the invoice. */
const DOC_MODE_COST_HINT: Record<WorkspaceAgent["documentGenerationMode"], string> = {
  auto: "Documents here typically cost ~$0.01–0.10. Editing an existing file costs more (~$1+) and needs a Claude model.",
  platform: "Documents here are server-rendered: ~$0.01 each, works on any model. This agent cannot edit an existing file.",
  sandbox: "This agent generates and edits documents via the Anthropic sandbox: ~$0.10 to generate, ~$1+ to edit an existing file.",
};

type TimelineItem =
  | { kind: "planning"; iteration: number }
  | { kind: "tool_start"; tool: string; server: string; args: Record<string, unknown> }
  | { kind: "tool_result"; tool: string; outcome: string; ok: boolean; preview: string }
  | { kind: "denied"; tool: string }
  | { kind: "team_progress"; wave: number; totalWaves: number; nodeLabel: string; status: "running" | "completed" | "failed" }
  | { kind: "team_awaiting_approval"; wave: number; totalWaves: number; nodeLabel: string; approvalId: string }
  | { kind: "answer"; text: string; costUsd: number; traceId: string | null; generatedFiles?: Array<{ id: string; filename: string | null; mimeType: string | null }> };

interface Pending { approvalId: string | null; tool: string; summary: string; args: Record<string, unknown> }

const OUTCOME_STYLE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  deduplicated: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  tool_error: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  gate_blocked_policy: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  gate_blocked_skill: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

export default function Workspace() {
  const [agentId, setAgentId] = useState<string>("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string>("");
  const [editArgs, setEditArgs] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [attachingFileId, setAttachingFileId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const askBoxRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // When a new approval arrives, seed the editable form from its args.
  useEffect(() => {
    if (pending) { setEditArgs({ ...(pending.args || {}) }); setNote(""); }
  }, [pending]);

  // Pick up a file attached from the Files page (client/src/pages/files.tsx),
  // handed off via sessionStorage since that's a separately mounted page --
  // React state and a URL param carrying the whole object don't survive the
  // navigation as cleanly. Runs once on mount; the entry is consumed either way
  // so a stale one never reappears on a later visit.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_ATTACHMENT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PENDING_ATTACHMENT_KEY);
    try {
      const file: AttachedFile = JSON.parse(raw);
      setAttachments(prev => (prev.some(f => f.id === file.id) ? prev : [...prev, file]));
      setInput(prev => prev.trim() ? prev : `Edit the attached "${file.filename}": `);
      toast({ title: "Attached for editing", description: `${file.filename} — describe the change below and send.` });
    } catch { /* malformed/stale payload -- ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: agents = [] } = useQuery<WorkspaceAgent[]>({ queryKey: ["/api/workspace/agents"] });
  const { data: recentRuns = [] } = useQuery<MyRun[]>({ queryKey: ["/api/workspace/runs"] });
  const ontologyLabelMap = useMemo(
    () => buildOntologyLabelMap(agents.find(a => a.id === agentId)),
    [agents, agentId],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline, pending]);

  async function consumeStream(res: Response) {
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response stream");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let evt: any;
        try { evt = JSON.parse(line.slice(6)); } catch { continue; }
        handleEvent(evt);
      }
    }
  }

  function handleEvent(evt: any) {
    switch (evt.type) {
      case "run_started": setRunId(evt.runId); setAgentName(evt.agentName); break;
      case "planning": setTimeline(t => [...t, { kind: "planning", iteration: evt.iteration }]); break;
      case "tool_start": setTimeline(t => [...t, { kind: "tool_start", tool: evt.tool, server: evt.server, args: evt.args }]); break;
      case "tool_result": setTimeline(t => [...t, { kind: "tool_result", tool: evt.tool, outcome: evt.outcome, ok: evt.ok, preview: evt.preview }]); break;
      case "denied": setTimeline(t => [...t, { kind: "denied", tool: evt.tool }]); break;
      case "team_progress":
        setTimeline(t => {
          const item: TimelineItem = { kind: "team_progress", wave: evt.wave, totalWaves: evt.totalWaves, nodeLabel: evt.nodeLabel, status: evt.status };
          const idx = t.findIndex(i => i.kind === "team_progress" && i.wave === evt.wave && i.nodeLabel === evt.nodeLabel);
          if (idx >= 0) { const next = [...t]; next[idx] = item; return next; }
          return [...t, item];
        });
        break;
      case "awaiting_approval": setPending({ approvalId: evt.approvalId, tool: evt.tool, summary: evt.summary, args: evt.args }); break;
      case "team_awaiting_approval":
        setTimeline(t => [...t, { kind: "team_awaiting_approval", wave: evt.wave, totalWaves: evt.totalWaves, nodeLabel: evt.nodeLabel, approvalId: evt.approvalId }]);
        break;
      case "completed": setTimeline(t => [...t, { kind: "answer", text: evt.output, costUsd: evt.costUsd, traceId: evt.traceId, generatedFiles: evt.generatedFiles }]); break;
      case "error": setTimeline(t => [...t, { kind: "answer", text: `Something went wrong: ${evt.message}`, costUsd: 0, traceId: null }]); break;
    }
  }

  /**
   * "Edit this file" — the manual round-trip (download, then re-upload as an
   * attachment) verified to work but is genuinely clunky; this collapses it to
   * one click. Server-side, POST /api/agent-files/:id/attach copies the
   * generated file's bytes into uploaded_files so it flows through the exact
   * same attachment path a manual upload would.
   */
  async function editFile(file: GeneratedFileRef) {
    setAttachingFileId(file.id);
    try {
      const res = await apiRequest("POST", `/api/agent-files/${file.id}/attach`, {});
      const attached = await res.json();
      setAttachments(prev => (prev.some(f => f.id === attached.id) ? prev : [...prev, {
        id: attached.id, filename: attached.filename, kind: attached.kind,
        sizeBytes: attached.sizeBytes, summary: attached.summary, charCount: attached.charCount,
      }]));
      // Only seed the prompt if the box is empty -- never clobber something the
      // user was already typing.
      setInput(prev => prev.trim() ? prev : `Edit the attached "${attached.filename}": `);
      toast({ title: "Attached for editing", description: `${attached.filename} — describe the change below and send.` });
      askBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e: any) {
      toast({ title: "Failed to attach file", description: e.message, variant: "destructive" });
    } finally {
      setAttachingFileId(null);
    }
  }

  async function ask() {
    // An attachment alone is a valid request -- "summarise this deck" is
    // often just the file.
    if (!agentId || (!input.trim() && attachments.length === 0) || running) return;
    setTimeline([]); setPending(null); setRunId(null); setRunning(true);
    const question = input.trim();
    const fileIds = attachments.map(f => f.id);
    setInput(""); setAttachments([]);
    try {
      const res = await apiRequest("POST", "/api/workspace/runs/stream", { agentId, input: question, fileIds });
      await consumeStream(res);
    } catch (e: any) {
      handleEvent({ type: "error", message: e.message });
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/runs"] });
    }
  }

  async function decide(decision: "approve" | "deny") {
    if (!runId) return;
    const body: Record<string, unknown> = { decision, note: note.trim() || undefined };
    if (decision === "approve") body.edits = editArgs;
    setPending(null); setRunning(true);
    try {
      const res = await apiRequest("POST", `/api/workspace/runs/${runId}/resume/stream`, body);
      await consumeStream(res);
    } catch (e: any) {
      handleEvent({ type: "error", message: e.message });
    } finally {
      setRunning(false);
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/runs"] });
    }
  }

  function editable(v: unknown): boolean {
    return v === null || ["string", "number", "boolean"].includes(typeof v);
  }

  const started = timeline.length > 0 || pending || running;

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl mx-auto w-full" data-testid="page-workspace">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> Agent Workspace
        </h1>
        <p className="text-sm text-muted-foreground">Ask an agent to do the work. Watch it act, approve the important steps, get the outcome.</p>
      </div>

      {/* Ask box */}
      <Card ref={askBoxRef}>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Ask</span>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-[280px] h-8" data-testid="select-workspace-agent" aria-label="Choose an agent">
                <SelectValue placeholder="Choose an agent…" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id} data-testid={`option-agent-${a.id}`}>
                    {/* Plain-text suffix, not a nested Badge: Radix projects a
                        SelectItem's children into the closed trigger too, and a
                        component there renders oddly cramped at this width. */}
                    {a.name}{a.canGenerateDocuments ? "  ·  📄 Documents" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Cost hint: a user picking an agent that can generate or edit
              documents should see roughly what that costs BEFORE sending,
              not discover it on the invoice -- editing an existing file runs
              ~100x a plain generate. */}
          {(() => {
            const selected = agents.find(a => a.id === agentId);
            if (!selected?.canGenerateDocuments) return null;
            return (
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground" data-testid="text-document-cost-hint">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <span>{DOC_MODE_COST_HINT[selected.documentGenerationMode]}</span>
              </div>
            );
          })()}
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask(); }}
            placeholder="Describe the work you need done, or attach a file and ask about it…"
            className="min-h-[80px] resize-none"
            data-testid="input-workspace-ask"
          />
          <FileAttach context="workspace" value={attachments} onChange={setAttachments} disabled={running} />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
            <Button onClick={ask} disabled={!agentId || (!input.trim() && attachments.length === 0) || running} data-testid="button-workspace-send">
              {running ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              {running ? "Working…" : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live activity timeline */}
      {started && (
        <Card>
          <CardContent className="pt-5">
            {agentName && (
              <div className="flex items-center gap-2 mb-3 text-sm">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="font-medium">{agentName}</span>
                <span className="text-muted-foreground">is on it</span>
              </div>
            )}
            <div ref={scrollRef} className="flex flex-col gap-2.5 max-h-[440px] overflow-y-auto pr-1" data-testid="workspace-timeline">
              {timeline.map((item, i) => (
                <TimelineRow key={i} item={item} onEditFile={editFile} attachingFileId={attachingFileId} ontologyLabelMap={ontologyLabelMap} />
              ))}

              {pending && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 flex flex-col gap-3" data-testid="workspace-approval-card">
                  <div className="flex items-start gap-2.5">
                    <ShieldQuestion className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium">Approval needed</span>
                      <span className="text-[13px] text-muted-foreground">
                        The agent wants to run <b className="text-foreground font-mono text-xs">{pending.tool}</b>. Review or adjust before approving.
                      </span>
                    </div>
                  </div>

                  {/* Editable arguments — the human can change what the tool does. */}
                  {Object.keys(editArgs).length > 0 && (
                    <div className="flex flex-col gap-2 pl-1">
                      {Object.entries(editArgs).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2">
                          <label className="text-[11px] font-mono text-muted-foreground w-32 shrink-0 truncate" title={key}>{key}</label>
                          {editable(value) ? (
                            <Input
                              value={value === null ? "" : String(value)}
                              onChange={e => {
                                const raw = e.target.value;
                                const next = typeof value === "number" ? (raw === "" ? "" : Number(raw))
                                  : typeof value === "boolean" ? raw === "true" : raw;
                                setEditArgs(a => ({ ...a, [key]: next }));
                              }}
                              className="h-7 text-xs font-mono"
                              data-testid={`approval-arg-${key}`}
                            />
                          ) : (
                            <code className="text-[11px] bg-muted rounded px-2 py-1 flex-1 break-all">{JSON.stringify(value)}</code>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Optional note for the agent (reason, guidance)…"
                    className="min-h-[52px] text-xs resize-none"
                    data-testid="approval-note"
                  />

                  <div className="flex items-center gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => decide("deny")} data-testid="button-workspace-deny">
                      <Ban className="w-3.5 h-3.5 mr-1.5" /> Deny
                    </Button>
                    <Button size="sm" onClick={() => decide("approve")} data-testid="button-workspace-approve">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve
                    </Button>
                  </div>
                </div>
              )}

              {running && !pending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Work */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> My recent work</h2>
        {recentRuns.length === 0 ? (
          <EmptyState title="No requests yet" description="Ask an agent above to get started." />
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="workspace-my-work">
            {recentRuns.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-md border p-2.5 text-sm" data-testid={`my-work-${r.id}`}>
                <div className="mt-0.5"><RunStatusIcon status={r.status} /></div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="truncate font-medium">{r.requestText}</span>
                  {r.outputSummary && r.status === "completed" && (
                    <span className="text-[12px] text-muted-foreground line-clamp-1">{r.outputSummary}</span>
                  )}
                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                    {r.createdAt && <span>{relTime(r.createdAt)}</span>}
                    {r.costUsd > 0 && <span className="flex items-center gap-0.5"><CircleDollarSign className="w-3 h-3" />{r.costUsd.toFixed(4)}</span>}
                    {r.traceId && <Link href={`/runtime/runs/${r.traceId}`} className="text-primary flex items-center gap-0.5">signed trace <ArrowRight className="w-3 h-3" /></Link>}
                  </div>
                  {/* Without this the only link to a generated document is the live
                      timeline, which is React state -- one reload and a deck the
                      agent just produced is unreachable from the UI entirely. */}
                  {r.generatedFiles && r.generatedFiles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5" data-testid={`my-work-files-${r.id}`}>
                      {r.generatedFiles.map(f => (
                        <span key={f.id} className="flex items-center gap-2">
                          <a
                            href={`/api/agent-files/${f.id}/download`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit"
                            data-testid={`link-my-work-file-${f.id}`}
                          >
                            <Download className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[220px]">{f.filename || "Download generated file"}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => editFile(f)}
                            disabled={attachingFileId === f.id}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                            data-testid={`button-my-work-edit-file-${f.id}`}
                            title="Attach this file to a new request so you can ask an agent to change it"
                          >
                            {attachingFileId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                            Edit
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {r.status === "awaiting_approval" && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 shrink-0">Needs approval</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TimelineRow({ item, onEditFile, attachingFileId, ontologyLabelMap }: {
  item: TimelineItem;
  onEditFile: (file: GeneratedFileRef) => void;
  attachingFileId: string | null;
  ontologyLabelMap: Record<string, { displayLabel: string; conceptLabel: string }>;
}) {
  if (item.kind === "planning") {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Brain className="w-4 h-4 text-purple-500 shrink-0" />
        <span>Thinking through the next step{item.iteration > 1 ? ` (step ${item.iteration})` : ""}…</span>
      </div>
    );
  }
  if (item.kind === "tool_start") {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        <Wrench className="w-4 h-4 text-amber-500 shrink-0" />
        <span>Using <b className="font-medium">{item.tool}</b> <span className="text-muted-foreground">on {item.server}</span></span>
      </div>
    );
  }
  if (item.kind === "tool_result") {
    return (
      <div className="flex items-center gap-2 text-[13px] pl-6">
        {item.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
        <span className="text-muted-foreground truncate">{item.tool}</span>
        <Badge variant="outline" className={`text-[10px] ${OUTCOME_STYLE[item.outcome] ?? "text-muted-foreground"}`}>{item.outcome}</Badge>
      </div>
    );
  }
  if (item.kind === "denied") {
    return (
      <div className="flex items-center gap-2 text-[13px] pl-6">
        <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" />
        <span className="text-muted-foreground">Denied <b>{item.tool}</b></span>
      </div>
    );
  }
  if (item.kind === "team_progress") {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        {item.status === "running" ? (
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 animate-spin" />
        ) : item.status === "completed" ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
        )}
        <span className="text-muted-foreground">Step {item.wave}/{item.totalWaves}</span>
        <span>{item.nodeLabel}</span>
      </div>
    );
  }
  if (item.kind === "team_awaiting_approval") {
    return (
      <div className="flex items-center gap-2 text-[13px] rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5" data-testid="workspace-team-awaiting-approval">
        <ShieldQuestion className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <span className="text-muted-foreground">Step {item.wave}/{item.totalWaves}</span>
        <span>{item.nodeLabel} is waiting on a human decision</span>
        <Link href={`/approvals/${item.approvalId}`} className="flex items-center gap-1 text-primary ml-auto shrink-0">
          Review <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }
  // answer
  return (
    <div className="rounded-lg border bg-muted/30 p-4 mt-1 flex flex-col gap-2" data-testid="workspace-answer">
      <div className="text-sm whitespace-pre-wrap">{renderWithOntologyBadges(applyOntologyLabels(item.text, ontologyLabelMap))}</div>
      {item.generatedFiles && item.generatedFiles.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="workspace-generated-files">
          {item.generatedFiles.map(f => (
            <div key={f.id} className="flex items-center gap-3">
              <a
                href={`/api/agent-files/${f.id}/download`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-primary hover:underline w-fit"
                data-testid={`link-download-file-${f.id}`}
              >
                <Download className="h-3 w-3 shrink-0" />
                <span>{f.filename || "Download generated file"}</span>
              </a>
              <button
                type="button"
                onClick={() => onEditFile(f)}
                disabled={attachingFileId === f.id}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                data-testid={`button-edit-file-${f.id}`}
                title="Attach this file to a new request so you can ask an agent to change it"
              >
                {attachingFileId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t pt-2">
        <span className="flex items-center gap-1"><Receipt className="w-3 h-3" /> ${item.costUsd.toFixed(4)}</span>
        {item.traceId && <Link href={`/runtime/runs/${item.traceId}`} className="flex items-center gap-1 text-primary">signed trace <ArrowRight className="w-3 h-3" /></Link>}
      </div>
    </div>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === "awaiting_approval") return <ShieldQuestion className="w-4 h-4 text-amber-500 shrink-0" />;
  if (status === "denied") return <Ban className="w-4 h-4 text-muted-foreground shrink-0" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
  return <Loader2 className="w-4 h-4 text-muted-foreground shrink-0" />;
}
