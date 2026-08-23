/**
 * Agent Workspace — the consumption surface. A person asks an agent to do
 * work, watches it act live, approves the risky step inline, and sees the
 * outcome. Streams from POST /api/workspace/runs/stream; resumes at approval
 * gates via /resume/stream. Every run is governed and produces a signed trace.
 */
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Sparkles, Send, Brain, Wrench, CheckCircle2, ShieldQuestion, XCircle,
  Ban, Loader2, Clock, Receipt, ArrowRight, CircleDollarSign, Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileAttach, type AttachedFile } from "@/components/file-attach";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EmptyState } from "@/components/ui-vocab";

interface WorkspaceAgent { id: string; name: string; description: string | null; riskTier: string }
interface MyRun { id: string; agentId: string; status: string; requestText: string; outputSummary: string | null; costUsd: number; traceId: string | null; createdAt: string | null }

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // When a new approval arrives, seed the editable form from its args.
  useEffect(() => {
    if (pending) { setEditArgs({ ...(pending.args || {}) }); setNote(""); }
  }, [pending]);

  const { data: agents = [] } = useQuery<WorkspaceAgent[]>({ queryKey: ["/api/workspace/agents"] });
  const { data: recentRuns = [] } = useQuery<MyRun[]>({ queryKey: ["/api/workspace/runs"] });

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
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Ask</span>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="w-[280px] h-8" data-testid="select-workspace-agent" aria-label="Choose an agent">
                <SelectValue placeholder="Choose an agent…" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id} data-testid={`option-agent-${a.id}`}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {timeline.map((item, i) => <TimelineRow key={i} item={item} />)}

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

function TimelineRow({ item }: { item: TimelineItem }) {
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
      <div className="text-sm whitespace-pre-wrap">{item.text}</div>
      {item.generatedFiles && item.generatedFiles.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="workspace-generated-files">
          {item.generatedFiles.map(f => (
            <a
              key={f.id}
              href={`/api/agent-files/${f.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-primary hover:underline w-fit"
              data-testid={`link-download-file-${f.id}`}
            >
              <Download className="h-3 w-3 shrink-0" />
              <span>{f.filename || "Download generated file"}</span>
            </a>
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
