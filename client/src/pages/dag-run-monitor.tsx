/**
 * Live view of a single team-pipeline DAG run (dag_execution_runs row), in the
 * Astra workspace look (.astra-scope). Polls the run every 2s until it reaches
 * a terminal status and follows the live SSE feed, rendering:
 *
 * - a timeline: every step as a bar on one time axis, grouped by stage (wave),
 *   so steps that ran side by side and the slow ones are visible at a glance;
 *   approval gates read as a person's decision, not as a long-running agent;
 * - a detail pane for the selected step: its own output (markdown), files,
 *   error or decision;
 * - the run's deliverables, a banner linking straight to a pending approval,
 *   and the activity feed and raw state tucked behind disclosures.
 */
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Network, XCircle, Loader2, ArrowRight, AlertTriangle, Bot, UserCheck,
  Hand, CheckCircle2, Copy, Check, Download, FileText, Radio, Maximize2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/markdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { DagExecutionRun, Agent, Approval } from "@shared/schema";
import { collectRunFiles, FILES_KEY_SUFFIX, type RunFile } from "@shared/run-files";
import { splitWorkingNotes, extractHtmlDocument, openHtmlInBrowser } from "@/lib/agent-output";

// Mirrors computeWaves()'s real output shape (server/dag-execution-engine.ts)
// -- GET /api/team-agents/:id/dag-waves returns this raw wave plan, where
// each wave's `nodes` is just an array of node ids; labels live separately
// in `nodeConfig` keyed by id.
interface WavePlanWave { wave_number: number; nodes: string[] }
interface ComputedWavePlan {
  totalWaves: number;
  maxParallelism: number;
  waves: WavePlanWave[];
  nodeConfig: Record<string, { label: string; nodeType?: string; gateType?: string | null; stateKey?: string }>;
}

interface DagWaveNodeResult {
  nodeId: string;
  status: string;
  error?: string;
  durationMs: number;
  output: Record<string, any>;
}
interface DagWaveResult {
  waveNumber: number;
  /** Set when the wave ran again inside a revise-on-failure loop. */
  revisionRound?: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  nodes: DagWaveNodeResult[];
}

// Mirror of server/dag-run-events.ts DagRunEvent -- the live SSE feed shape.
interface DagRunLiveEvent {
  type: "node_start" | "node_complete" | "wave_complete" | "approval_pending" | "run_complete";
  ts: string;
  wave?: number;
  totalWaves?: number;
  nodeId?: string;
  label?: string;
  status?: string;
  durationMs?: number;
  outputPreview?: string;
  error?: string;
  runStatus?: string;
}

const TERMINAL_STATUSES = new Set(["completed", "completed_with_skips", "failed", "cancelled"]);
/** Runs a person can still stop. */
const CANCELLABLE_STATUSES = new Set(["running", "waiting_approval"]);

// Names the wave shape this run's plan already executes. Purely a label;
// execution semantics are unchanged.
const ORCHESTRATION_PATTERN_LABELS: Record<string, string> = {
  sequential: "Sequential",
  concurrent: "Concurrent",
  mixed: "Mixed",
  single: "Single step",
  magentic: "Dynamic manager",
};

/** Bookkeeping keys the pipeline adds for its own use: noise to someone asking "what did this agent say?". */
const OUTPUT_NOISE_KEYS = new Set(["selectedAgentName", "managerReasoning", "__meta"]);

type DagExecutionRunWithPattern = DagExecutionRun & { orchestrationPattern?: string };

/** What a step is doing, as the page shows it. Live states come from the plan + feed, not the stored results. */
type StepState = "completed" | "failed" | "skipped" | "running" | "waiting" | "pending";

interface Step {
  id: string;
  /** Unique per rendered row: a revision re-runs the same node. */
  key: string;
  label: string;
  kind: "agent" | "gate";
  state: StepState;
  /** ms from run start. */
  offset: number;
  durationMs: number | null;
  error?: string;
  result?: DagWaveNodeResult;
  stateKey?: string;
}
interface Stage {
  key: string;
  number: number;
  revisionRound?: number;
  steps: Step[];
}

function durationLabel(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  if (s < 1) return `${ms}ms`;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function humanizeKey(key: string): string {
  return key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, c => c.toUpperCase());
}

/**
 * A state-key value that's itself a flat bag of prose (every value a string,
 * e.g. a research step's { request, market_analysis, ... }) reads as
 * escaped-newline JSON under plain JSON.stringify; render it as headed
 * markdown sections instead.
 */
function formatOutputValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).length > 0 &&
    Object.values(value).every((v) => typeof v === "string")
  ) {
    return Object.entries(value as Record<string, string>)
      .map(([k, v]) => `## ${k}\n\n${v}`)
      .join("\n\n");
  }
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

/** What THIS step produced, as readable entries (file lists are shown as files, not JSON). */
function outputEntries(node: DagWaveNodeResult | undefined): Array<{ key: string; text: string }> {
  const out = node?.output;
  if (!out || typeof out !== "object") return [];
  return Object.entries(out)
    .filter(([k, v]) => !OUTPUT_NOISE_KEYS.has(k) && !k.endsWith(FILES_KEY_SUFFIX) && v != null && v !== "")
    .map(([key, value]) => ({ key, text: formatOutputValue(value) }));
}

/** A gate's recorded decision ({ approved, decidedBy }) under whatever state key it writes. */
function gateDecision(node: DagWaveNodeResult | undefined): { approved: boolean; decidedBy?: string } | null {
  for (const v of Object.values(node?.output ?? {})) {
    if (v && typeof v === "object" && typeof (v as any).approved === "boolean") return v as any;
  }
  return null;
}

/** A run deliverable, with the step that produced it when that can be told from the state key it was saved under. */
type DeliverableFile = RunFile & { from?: string };

/**
 * The run's deliverables: every file in its latest state, attributed to the
 * step whose state key holds it. A later step's file with the same name as an
 * earlier step's is the newer version of that deliverable (live: a QA step
 * saving the corrected workbook under the builder's filename), so only the
 * latest step's copy is offered. Several same-named files from ONE step (an
 * image tool's "image.png" x8) are distinct deliverables and all kept.
 */
function runDeliverables(state: unknown, steps: Array<{ stateKey?: string; label: string }>): DeliverableFile[] {
  const files = collectRunFiles(state);
  if (!state || typeof state !== "object") return files;
  // stateKey -> the latest step (timeline order) that writes it; a revision re-runs a step later.
  const producer = new Map<string, { label: string; order: number }>();
  steps.forEach((st, order) => { if (st.stateKey) producer.set(st.stateKey, { label: st.label, order }); });
  const origin = new Map<string, { label: string; order: number }>();
  const attribute = (key: string, value: unknown) => {
    const who = producer.get(key);
    if (!who || !Array.isArray(value)) return;
    for (const f of value) if (f && typeof (f as RunFile).id === "string" && !origin.has((f as RunFile).id)) origin.set((f as RunFile).id, who);
  };
  for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
    if (key.endsWith(FILES_KEY_SUFFIX)) attribute(key.slice(0, -FILES_KEY_SUFFIX.length), value);
    // A nested team step's whole state lands under its own key.
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k2, v2] of Object.entries(value as Record<string, unknown>)) if (k2.endsWith(FILES_KEY_SUFFIX)) attribute(key, v2);
    }
  }
  const latestByName = new Map<string, number>();
  for (const f of files) {
    const o = origin.get(f.id)?.order ?? -1;
    if (f.filename) latestByName.set(f.filename, Math.max(latestByName.get(f.filename) ?? -1, o));
  }
  return files
    .filter((f) => !f.filename || (origin.get(f.id)?.order ?? -1) === latestByName.get(f.filename))
    .map((f) => ({ ...f, from: origin.get(f.id)?.label }));
}

const isImage = (f: RunFile) => (f.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.filename ?? "");
const fileHref = (f: RunFile) => `/api/agent-files/${f.id}/download`;

/** A tick spacing that gives the axis roughly four to six labels. */
function tickSpacing(totalMs: number): number {
  const steps = [5e3, 1e4, 3e4, 6e4, 12e4, 3e5, 6e5, 9e5, 18e5, 36e5, 72e5];
  return steps.find((s) => totalMs / s <= 6) ?? 144e5;
}
const tickLabel = (ms: number) => (ms === 0 ? "0" : ms < 6e4 ? `${ms / 1000}s` : ms < 36e5 ? `${ms / 6e4}m` : `${ms / 36e5}h`);

const DISPLAY = { fontFamily: "var(--astra-display)" } as const;

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] uppercase tracking-wider text-muted-foreground ${className}`}>{children}</span>;
}

function Dot({ state, className = "" }: { state: StepState | "ok" | "live"; className?: string }) {
  const tone: Record<string, string> = {
    completed: "bg-[hsl(var(--astra-ok))]",
    ok: "bg-[hsl(var(--astra-ok))]",
    failed: "bg-[hsl(var(--astra-fail))]",
    waiting: "bg-[hsl(var(--astra-warn))]",
    running: "bg-[hsl(var(--astra-volt))] run-dot-live",
    live: "bg-[hsl(var(--astra-volt))] run-dot-live",
    skipped: "border border-muted-foreground bg-transparent",
    pending: "border border-muted-foreground bg-transparent",
  };
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone[state] ?? "bg-muted-foreground"} ${className}`} />;
}

const STATE_LABEL: Record<StepState, string> = {
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
  running: "Working",
  waiting: "Waiting for a person",
  pending: "Not started",
};

const RUN_STATUS: Record<string, { label: string; dot: StepState | "live" | "ok" }> = {
  completed: { label: "Completed", dot: "ok" },
  completed_with_skips: { label: "Completed, some steps skipped", dot: "waiting" },
  failed: { label: "Failed", dot: "failed" },
  cancelled: { label: "Cancelled", dot: "skipped" },
  running: { label: "Running", dot: "live" },
  waiting_approval: { label: "Waiting for approval", dot: "waiting" },
  pending: { label: "Starting", dot: "live" },
};

export default function DagRunMonitor() {
  const [, params] = useRoute("/dag-runs/:runId");
  const runId = params?.runId;

  const { data: run, isLoading } = useQuery<DagExecutionRunWithPattern>({
    queryKey: ["/api/dag-execution-runs", runId],
    enabled: !!runId,
    refetchInterval: (query) => {
      const d = query.state.data as DagExecutionRunWithPattern | undefined;
      if (d && TERMINAL_STATUSES.has(d.status)) return false;
      return 2000;
    },
  });

  const teamAgentId = run?.teamAgentId ?? undefined;

  const { data: teamAgent } = useQuery<Agent>({
    queryKey: ["/api/agents", teamAgentId],
    enabled: !!teamAgentId,
  });

  const isMagentic = run?.orchestrationPattern === "magentic";

  // A Magentic run has no blueprint graph, so there's no static wave plan to
  // fetch -- GET /api/team-agents/:id/dag-waves 400s for these teams. Node
  // labels come from each step's own persisted output instead.
  const { data: wavePlan } = useQuery<ComputedWavePlan>({
    queryKey: ["/api/team-agents", teamAgentId, "dag-waves"],
    enabled: !!teamAgentId && !isMagentic,
  });

  const { data: approvals } = useQuery<Approval[]>({
    queryKey: ["/api/approvals"],
    enabled: run?.status === "waiting_approval",
    refetchInterval: run?.status === "waiting_approval" ? 3000 : false,
  });

  // Live step-by-step activity via SSE -- the poll above keeps the stored run
  // fresh, but only this stream says "Copywriting agent started" the moment it happens.
  const [liveEvents, setLiveEvents] = useState<DagRunLiveEvent[]>([]);
  const [streamOpen, setStreamOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [askedOpen, setAskedOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { toast } = useToast();
  const feedRef = useRef<HTMLDivElement>(null);
  const runIsTerminal = run ? TERMINAL_STATUSES.has(run.status) : false;

  useEffect(() => {
    if (!runId) return;
    const es = new EventSource(`/api/dag-execution-runs/${runId}/events`);
    es.onopen = () => setStreamOpen(true);
    es.onmessage = (msg) => {
      try {
        const e = JSON.parse(msg.data) as DagRunLiveEvent;
        setLiveEvents(prev => (prev.length >= 400 ? [...prev.slice(-399), e] : [...prev, e]));
        // Poll intervals pause while the tab is backgrounded (react-query
        // default) -- drive the refresh off the stream too, so status, waves,
        // and final outputs land the moment they happen.
        if (e.type === "node_complete" || e.type === "wave_complete" || e.type === "approval_pending" || e.type === "run_complete") {
          queryClient.invalidateQueries({ queryKey: ["/api/dag-execution-runs", runId] });
        }
        if (e.type === "run_complete") { es.close(); setStreamOpen(false); }
      } catch { /* ignore malformed frame */ }
    };
    es.onerror = () => setStreamOpen(false);
    return () => es.close();
  }, [runId]);

  // Running clocks (elapsed, "working for 1m 12s") tick while the run is live.
  useEffect(() => {
    if (!run || runIsTerminal) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run, runIsTerminal]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [liveEvents.length]);

  async function submitCancel() {
    if (!runId) return;
    setCancelling(true);
    try {
      await apiRequest("POST", `/api/dag-execution-runs/${runId}/cancel`, { reason: cancelReason.trim() });
      toast({ title: "Run cancelled", description: "It will not run any further steps." });
      setCancelOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/dag-execution-runs", runId] });
    } catch (err: any) {
      toast({ title: "Could not cancel the run", description: err?.message || "Try again.", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }

  const waveResults = (run?.waveResults as unknown as DagWaveResult[]) || [];
  const startedMs = run?.startedAt ? new Date(run.startedAt).getTime() : null;
  const endMs = run?.completedAt ? new Date(run.completedAt).getTime() : now;
  const elapsedMs = startedMs != null ? Math.max(0, endMs - startedMs) : null;

  // Build the stages: stored results first, then (while the run is live) the
  // wave in flight and the planned waves still to come.
  const stages = useMemo<Stage[]>(() => {
    if (!run) return [];
    const cfg = wavePlan?.nodeConfig ?? {};
    const t0 = startedMs ?? Date.now();
    const labelOf = (nodeId: string, node?: DagWaveNodeResult) => cfg[nodeId]?.label || node?.output?.selectedAgentName || nodeId;
    const kindOf = (nodeId: string): Step["kind"] => (cfg[nodeId]?.nodeType === "edge_gate" ? "gate" : "agent");

    const out: Stage[] = waveResults.map((w, i) => {
      const offset = Math.max(0, new Date(w.startedAt).getTime() - t0);
      return {
        key: `${w.waveNumber}-${i}`,
        number: w.waveNumber,
        revisionRound: w.revisionRound,
        steps: w.nodes.map((n) => ({
          id: n.nodeId,
          key: `${n.nodeId}-${i}`,
          label: labelOf(n.nodeId, n),
          kind: kindOf(n.nodeId),
          state: (["completed", "failed", "skipped"].includes(n.status) ? n.status : "completed") as StepState,
          offset,
          durationMs: n.durationMs,
          error: n.error,
          result: n,
          stateKey: cfg[n.nodeId]?.stateKey,
        })),
      };
    });

    if (!TERMINAL_STATUSES.has(run.status) && wavePlan?.waves?.length) {
      const last = waveResults[waveResults.length - 1];
      const currentNumber = (last?.waveNumber ?? 0) + 1;
      const currentStart = last ? new Date(last.completedAt).getTime() : t0;
      // What the live feed has said about each node since the last stored result.
      const startedAt = new Map<string, number>();
      const finished = new Map<string, DagRunLiveEvent>();
      for (const e of liveEvents) {
        if (!e.nodeId || new Date(e.ts).getTime() < currentStart) continue;
        if (e.type === "node_start") startedAt.set(e.nodeId, new Date(e.ts).getTime());
        if (e.type === "node_complete") finished.set(e.nodeId, e);
      }
      for (const w of wavePlan.waves.filter((pw) => pw.wave_number >= currentNumber)) {
        const inFlight = w.wave_number === currentNumber;
        out.push({
          key: `plan-${w.wave_number}`,
          number: w.wave_number,
          steps: w.nodes.map((nodeId) => {
            const kind = kindOf(nodeId);
            const done = inFlight ? finished.get(nodeId) : undefined;
            const began = startedAt.get(nodeId) ?? currentStart;
            let state: StepState = "pending";
            if (inFlight) {
              if (done) state = done.status === "failed" ? "failed" : done.status === "skipped" ? "skipped" : "completed";
              else if (kind === "gate" && run.status === "waiting_approval") state = "waiting";
              else state = "running";
            }
            return {
              id: nodeId,
              key: `${nodeId}-plan-${w.wave_number}`,
              label: labelOf(nodeId),
              kind,
              state,
              offset: inFlight ? Math.max(0, began - t0) : Math.max(0, now - t0),
              durationMs: done?.durationMs ?? (state === "running" || state === "waiting" ? Math.max(0, now - began) : null),
              error: done?.error,
              stateKey: cfg[nodeId]?.stateKey,
            };
          }),
        });
      }
    }
    return out;
  }, [run, wavePlan, waveResults, liveEvents, startedMs, now]);

  const steps = stages.flatMap((s) => s.steps.map((st) => ({ ...st, stage: s })));
  const defaultStep =
    steps.find((s) => s.state === "waiting") ??
    steps.find((s) => s.state === "running") ??
    [...steps].reverse().find((s) => s.state === "failed") ??
    [...steps].reverse().find((s) => s.kind === "agent" && outputEntries(s.result).length > 0) ??
    steps[0];
  const selected = steps.find((s) => s.key === selectedKey) ?? defaultStep;

  if (isLoading) {
    return (
      <div className="astra-scope bg-background text-foreground font-sans h-full overflow-y-auto" data-testid="page-dag-run-monitor-loading">
        <div className="max-w-[1480px] mx-auto p-6 flex flex-col gap-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-5 w-[32rem] max-w-full" />
          <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6 flex flex-col items-center gap-4 py-20">
        <Network className="w-12 h-12 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Run not found</p>
        <Link href="/agents/teams">
          <Button variant="outline" data-testid="button-back-teams">Back to Teams</Button>
        </Link>
      </div>
    );
  }

  const allNodes = waveResults.flatMap(w => w.nodes);
  // The files the run currently stands behind: from its latest state, so a file
  // a revision replaced (or withdrew) is not offered here as the deliverable.
  const runFiles = runDeliverables(run.finalState ?? run.currentState, steps);
  const completedCount = steps.filter(s => s.state === "completed").length;
  const failedCount = steps.filter(s => s.state === "failed").length;
  const skippedNodes = allNodes.filter(n => n.status === "skipped");
  const totalTokens = (run.totalPromptTokens ?? 0) + (run.totalCompletionTokens ?? 0);
  const backHref = (teamAgent as any)?.blueprintId ? `/blueprints/${(teamAgent as any).blueprintId}` : "/agents/teams";
  const teamHref = teamAgentId ? `/agents/${teamAgentId}` : "/agents/teams";
  const stepWord = isMagentic ? "Step" : "Stage";
  const status = RUN_STATUS[run.status] ?? { label: run.status.replace(/_/g, " "), dot: "pending" as StepState };
  const request = (run.initialState as any)?.request;
  const pendingApproval = (approvals || [])
    .filter(a => a.status === "pending" && a.agentId === teamAgentId)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
  const approvalId = pendingApproval?.id ?? (run as any).pendingApprovalId ?? null;
  const running = steps.filter(s => s.state === "running");
  const sideBySide = stages.filter(s => s.steps.length > 1).length;

  // Time axis: the whole run so far; pending steps sit at "now".
  const axisMs = Math.max(elapsedMs ?? 0, ...steps.map(s => s.offset + (s.durationMs ?? 0)), 1000);
  const tick = tickSpacing(axisMs);
  const ticks: number[] = [];
  for (let t = 0; t <= axisMs; t += tick) ticks.push(t);
  const pct = (ms: number) => Math.min(100, (ms / axisMs) * 100);

  // Activity: the live feed when we have one, else rebuilt from the stored step timings.
  const activity: Array<{ at: number; tone: StepState | "ok"; text: string; detail?: string }> = liveEvents.length
    ? liveEvents.map((e) => {
        const at = new Date(e.ts).getTime();
        if (e.type === "node_start") return { at, tone: "pending" as const, text: `${e.label} started${e.totalWaves ? ` (${stepWord.toLowerCase()} ${e.wave} of ${e.totalWaves})` : ""}` };
        if (e.type === "node_complete") return {
          at,
          tone: (e.status === "completed" ? "completed" : e.status === "skipped" ? "skipped" : "failed") as StepState,
          text: `${e.label} ${e.status === "completed" ? "finished" : e.status}${e.durationMs ? ` in ${durationLabel(e.durationMs)}` : ""}`,
          detail: e.error || e.outputPreview,
        };
        if (e.type === "approval_pending") return { at, tone: "waiting" as const, text: `Paused: ${e.label} is waiting for a person` };
        if (e.type === "wave_complete") return { at, tone: "ok" as const, text: `${stepWord} ${e.wave} of ${e.totalWaves} complete` };
        return { at, tone: (e.runStatus === "failed" ? "failed" : "completed") as StepState, text: `Run ${String(e.runStatus || "").replace(/_/g, " ")}` };
      })
    : startedMs != null
    ? steps
        .filter(s => s.state !== "pending")
        .flatMap(s => {
          const rows: Array<{ at: number; tone: StepState | "ok"; text: string; detail?: string }> = [{ at: startedMs + s.offset, tone: "pending", text: `${s.label} started` }];
          if (s.state !== "running" && s.state !== "waiting" && s.durationMs != null) {
            const d = s.kind === "gate" && s.state === "completed" ? gateDecision(s.result) : null;
            rows.push({
              at: startedMs + s.offset + s.durationMs,
              tone: s.state,
              text: d ? `${s.label}: approved${d.decidedBy ? ` by ${d.decidedBy}` : ""}` : `${s.label} ${s.state === "completed" ? "finished" : s.state} in ${durationLabel(s.durationMs)}`,
              detail: s.error,
            });
          }
          return rows;
        })
        .sort((a, b) => a.at - b.at)
    : [];

  return (
    <div className="astra-scope bg-background text-foreground font-sans h-full overflow-y-auto" data-testid="page-dag-run-monitor">
      <div className="max-w-[1480px] mx-auto px-6 py-5 pb-16 flex flex-col gap-5">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground self-start" data-testid="button-back">
          <ArrowLeft className="w-3.5 h-3.5" /> {(teamAgent as any)?.blueprintId ? "Back to blueprint" : "Back to teams"}
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight" style={DISPLAY} data-testid="text-run-title">
                {teamAgent?.name || "Team pipeline run"}
              </h1>
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-2.5 py-1 font-mono text-xs" data-testid="badge-run-status">
                <Dot state={status.dot} /> {status.label}
              </span>
              {run.orchestrationPattern && (
                <span className="font-mono text-[11px] text-muted-foreground" data-testid="badge-orchestration-pattern">
                  {ORCHESTRATION_PATTERN_LABELS[run.orchestrationPattern] || run.orchestrationPattern}
                </span>
              )}
            </div>
            {teamAgent?.description && <p className="text-sm text-muted-foreground max-w-[70ch]">{teamAgent.description}</p>}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={teamHref}><Button variant="outline" size="sm" data-testid="button-open-team">Open team</Button></Link>
            {CANCELLABLE_STATUSES.has(run.status) && (
              <Button variant="outline" size="sm" onClick={() => setCancelOpen(true)} data-testid="button-cancel-run">
                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancel run
              </Button>
            )}
          </div>
        </div>

        <Dialog open={cancelOpen} onOpenChange={(open) => { if (!cancelling) setCancelOpen(open); }}>
          <DialogContent data-testid="dialog-cancel-run">
            <DialogHeader>
              <DialogTitle>Cancel this run?</DialogTitle>
              <DialogDescription>
                The step in progress stops, no further steps run, and any approval it is waiting on is closed. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why are you cancelling it?"
              maxLength={500}
              data-testid="input-cancel-reason"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelling} data-testid="button-cancel-run-dismiss">Keep running</Button>
              <Button variant="destructive" onClick={submitCancel} disabled={cancelling || cancelReason.trim().length < 3} data-testid="button-cancel-run-confirm">
                {cancelling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}Cancel run
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Banners */}
        {run.status === "waiting_approval" && (
          <div className="flex items-center gap-3.5 rounded-lg border border-[hsl(var(--astra-volt))] bg-[hsl(var(--astra-volt)/0.12)] px-4 py-3.5 flex-wrap" data-testid="card-awaiting-approval">
            <Hand className="w-5 h-5 shrink-0" />
            <div className="flex flex-col flex-1 min-w-[220px]">
              <span className="text-sm font-medium">
                Waiting for your decision{steps.find(s => s.state === "waiting") ? `: ${steps.find(s => s.state === "waiting")!.label}` : ""}
              </span>
              <span className="text-sm text-muted-foreground">Nothing else in this run continues until a person approves or rejects it.</span>
            </div>
            {approvalId && (
              <Link href={`/approvals/${approvalId}`}>
                <Button size="sm" data-testid="button-review-approval">Review and decide <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
              </Link>
            )}
          </div>
        )}
        {run.status === "failed" && run.error && (
          <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--astra-fail)/0.4)] bg-[hsl(var(--astra-fail)/0.06)] px-4 py-3.5" data-testid="card-run-error">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-[hsl(var(--astra-fail))]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Run failed</span>
              <span className="text-sm text-muted-foreground" data-testid="text-run-error">{run.error}</span>
            </div>
          </div>
        )}
        {run.status === "cancelled" && run.error && (
          <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3.5" data-testid="card-run-cancelled">
            <XCircle className="w-5 h-5 shrink-0 text-muted-foreground" />
            <span className="text-sm">{run.error}</span>
          </div>
        )}
        {run.status === "completed_with_skips" && (
          <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--astra-warn)/0.5)] bg-[hsl(var(--astra-warn)/0.08)] px-4 py-3.5" data-testid="card-run-skipped">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[hsl(var(--astra-warn))]" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">This run finished, but not every step ran</span>
              <span className="text-sm text-muted-foreground" data-testid="text-run-skip-summary">
                {skippedNodes.length > 0
                  ? `${skippedNodes.length} step${skippedNodes.length !== 1 ? "s" : ""} didn't run because no condition leading into ${skippedNodes.length !== 1 ? "them" : "it"} was met${
                      skippedNodes.length <= 5 ? `: ${skippedNodes.map(n => steps.find(s => s.id === n.nodeId)?.label ?? n.nodeId).join(", ")}.` : "."
                    } This can be expected branching, or a sign a condition never matches. Check the timeline below.`
                  : "A step inside one of this run's nested teams was skipped. Open that team's own run to see which step and why."}
              </span>
            </div>
          </div>
        )}

        {running.length > 0 && (
          <div className="flex items-center gap-2.5 font-mono text-[13px] text-muted-foreground" data-testid="text-live-now">
            <Dot state="live" />
            {running.length === 1
              ? `${running[0].label} is working · ${durationLabel(running[0].durationMs)}`
              : `${running.length} agents working side by side: ${running.map(r => r.label).join(", ")}`}
            {streamOpen && <span className="inline-flex items-center gap-1 text-[11px]" data-testid="badge-live-stream"><Radio className="w-3 h-3" /> live</span>}
          </div>
        )}

        {/* Facts */}
        <div className="flex flex-wrap gap-x-7 gap-y-2 font-mono tabular-nums" data-testid="section-run-facts">
          {([
            ["Started", run.startedAt ? new Date(run.startedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—", undefined],
            [runIsTerminal ? "Took" : "Running for", durationLabel(elapsedMs), "stat-elapsed"],
            ["Steps", `${completedCount} of ${steps.length} done${failedCount ? ` · ${failedCount} failed` : ""}`, "stat-completed"],
            [isMagentic ? "Step" : "Stage", isMagentic ? `${run.currentWave ?? 0} of ${run.totalWaves ?? 0} max` : `${run.currentWave ?? 0} of ${run.totalWaves ?? 0}`, "stat-wave"],
            ["Tokens", totalTokens >= 1000 ? `${Math.round(totalTokens / 1000)}k` : String(totalTokens), "stat-tokens"],
            ...(typeof run.totalCostUsd === "number" ? [["Cost", `$${run.totalCostUsd.toFixed(2)}`, "stat-cost"]] : []),
            ...(run.totalToolCalls ? [["Tool calls", String(run.totalToolCalls), "stat-tool-calls"]] : []),
            ["Run", run.id.slice(0, 8), "text-run-id"],
          ] as Array<[string, string, string | undefined]>).map(([k, v, id]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <Eyebrow>{k}</Eyebrow>
              <span className="text-sm font-medium" data-testid={id}>{v}</span>
            </div>
          ))}
        </div>

        {typeof request === "string" && request.trim() && (
          <div className="rounded-lg border bg-card px-4 py-3 flex flex-col gap-1.5" data-testid="section-run-request">
            <Eyebrow>What the team was asked</Eyebrow>
            <p className={`text-sm whitespace-pre-wrap max-w-[110ch] ${askedOpen ? "" : "line-clamp-2"}`}>{request}</p>
            {request.length > 200 && (
              <button type="button" onClick={() => setAskedOpen(v => !v)} className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                {askedOpen ? "Show less" : "Show full request"}
              </button>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            {/* Timeline */}
            <div className="rounded-xl border bg-card p-4 pb-2.5" data-testid="section-run-timeline">
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <h2 className="text-base font-semibold" style={DISPLAY}>Timeline</h2>
                <Eyebrow>{steps.length} steps{sideBySide ? ` · ${sideBySide} ${stepWord.toLowerCase()}${sideBySide > 1 ? "s" : ""} ran side by side` : ""}</Eyebrow>
              </div>
              <div className="[--name:128px] sm:[--name:170px] xl:[--name:250px]">
                <div className="grid grid-cols-[var(--name)_1fr] font-mono text-[11px] text-muted-foreground mb-1">
                  <span />
                  <div className="relative h-4 mr-2">
                    {ticks.map((t) => (
                      <span key={t} className="absolute" style={{ left: `${pct(t)}%`, transform: t === 0 ? undefined : "translateX(-50%)" }}>{tickLabel(t)}</span>
                    ))}
                  </div>
                </div>
                {stages.map((stage) => (
                  <div key={stage.key} className="border-t pt-2 pb-1.5" data-testid={`card-wave-${stage.number}${stage.revisionRound ? `-r${stage.revisionRound}` : ""}`}>
                    <div className="flex items-baseline gap-2.5 px-1.5 pb-1">
                      <span className="font-mono text-xs font-medium">{stepWord} {stage.number}{stage.revisionRound ? ` · revision ${stage.revisionRound}` : ""}</span>
                      <Eyebrow>
                        {stage.steps.length > 1 ? `${stage.steps.length} side by side` : stage.steps[0]?.kind === "gate" ? "person decides" : "one step"}
                      </Eyebrow>
                    </div>
                    {stage.steps.map((s) => {
                      const left = pct(s.offset);
                      const width = s.state === "pending" ? 0 : Math.max(0.5, pct(s.durationMs ?? 0));
                      const barClass =
                        s.state === "pending" ? "run-bar-pending"
                        : s.kind === "gate" ? "run-bar-gate"
                        : s.state === "running" ? "run-bar-running"
                        : s.state === "failed" ? "bg-[hsl(var(--astra-fail))]"
                        : s.state === "skipped" ? "run-bar-pending"
                        : s.key === selected?.key ? "bg-[hsl(var(--ring))]" : "bg-foreground/75";
                      const decision = s.kind === "gate" ? gateDecision(s.result) : null;
                      const text =
                        s.state === "pending" ? "not started"
                        : s.state === "running" ? `${durationLabel(s.durationMs)} so far`
                        : s.state === "waiting" ? `waiting ${durationLabel(s.durationMs)}`
                        : s.state === "skipped" ? "skipped"
                        : s.kind === "gate" && decision ? `approved after ${durationLabel(s.durationMs)}`
                        : s.kind === "gate" && s.state === "failed" ? "rejected"
                        : durationLabel(s.durationMs);
                      const labelOnLeft = left + width > 76;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setSelectedKey(s.key)}
                          aria-pressed={s.key === selected?.key}
                          className={`grid grid-cols-[var(--name)_1fr] items-center w-full min-h-[38px] rounded-md text-left transition-colors ${s.key === selected?.key ? "bg-accent" : "hover:bg-muted"}`}
                          data-testid={`row-node-${s.id}`}
                        >
                          <span className="flex items-center gap-2 pl-2.5 pr-2 min-w-0 text-sm">
                            <Dot state={s.state} />
                            {s.kind === "gate"
                              ? <UserCheck className="w-4 h-4 shrink-0 text-muted-foreground hidden sm:block" />
                              : <Bot className="w-4 h-4 shrink-0 text-muted-foreground hidden sm:block" />}
                            <span className={`truncate ${s.state === "skipped" || s.state === "pending" ? "text-muted-foreground" : ""}`}>{s.label}</span>
                          </span>
                          <span
                            className="relative h-[38px] mr-2"
                            style={{ backgroundImage: "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px)", backgroundSize: `${pct(tick)}% 100%` }}
                          >
                            <span className={`absolute top-3 h-3.5 rounded ${barClass}`} style={{ left: `${Math.min(left, 99)}%`, width: s.state === "pending" ? 14 : `${width}%`, minWidth: 4 }} />
                            <span
                              className="absolute top-2.5 font-mono text-[11px] text-muted-foreground whitespace-nowrap tabular-nums"
                              style={labelOnLeft ? { right: `${100 - left + 1}%` } : { left: `calc(${left + width}% + ${s.state === "pending" ? 22 : 8}px)` }}
                            >
                              {text}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {stages.length === 0 && (
                  <div className="border-t py-4 px-1.5 flex items-center gap-2 text-sm text-muted-foreground" data-testid="card-run-starting">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {isMagentic ? "The manager is deciding the first step…" : "Starting the first stage…"}
                  </div>
                )}
                {isMagentic && run.status === "running" && (
                  <div className="border-t py-3 px-1.5 text-xs text-muted-foreground" data-testid="card-magentic-cap">
                    Up to {(run.totalWaves ?? 0) - waveResults.length} more step{((run.totalWaves ?? 0) - waveResults.length) !== 1 ? "s" : ""} may run before the manager finishes or hits the step cap.
                  </div>
                )}
              </div>
              <div className="flex gap-4 flex-wrap border-t mt-1 pt-2.5 px-1.5 font-mono text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block w-[18px] h-2 rounded-sm bg-foreground/75" />Agent working</span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block w-[18px] h-2 rounded-sm run-bar-gate" />Waiting for a person</span>
                <span>Select a step to see what it produced</span>
              </div>
            </div>

            {/* Deliverables */}
            {runFiles.length > 0 && (
              <div className="rounded-xl border bg-card p-4 flex flex-col gap-3" data-testid="card-run-files">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold" style={DISPLAY}>Deliverables</h2>
                  <Eyebrow>{runFiles.length} file{runFiles.length !== 1 ? "s" : ""}</Eyebrow>
                </div>
                <FileGallery files={runFiles} testIdPrefix="link-run-file" />
              </div>
            )}

            {/* Activity */}
            {activity.length > 0 && (
              <details className="group rounded-xl border bg-card" open={!runIsTerminal} data-testid="section-live-activity">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={DISPLAY}>
                  Activity
                  <span className="font-mono text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
                </summary>
                <div ref={feedRef} className="max-h-72 overflow-y-auto px-4 pb-3.5 flex flex-col font-mono text-xs leading-relaxed" data-testid="feed-live-activity">
                  {activity.map((a, i) => (
                    <div key={i} className="grid grid-cols-[72px_14px_1fr] gap-2 items-start py-0.5" data-testid={`event-${i}`}>
                      <time className="text-muted-foreground tabular-nums">{new Date(a.at).toLocaleTimeString()}</time>
                      <span className="pt-1"><Dot state={a.tone === "ok" ? "completed" : a.tone} /></span>
                      <span className="min-w-0">
                        {a.text}
                        {a.detail && <span className="block truncate text-muted-foreground" title={a.detail}>{a.detail}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {/* Raw state, for people debugging a run */}
            {!!(run.finalState ?? run.currentState) && (
              <details className="group rounded-xl border bg-card" data-testid="details-raw-final-state">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-semibold" style={DISPLAY}>
                  Technical details
                  <span className="font-mono text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground hidden group-open:inline">Hide</span>
                </summary>
                <div className="px-4 pb-4 flex flex-col gap-2">
                  <Eyebrow>{run.finalState ? "Final state" : "Current state"} (JSON) · run {run.id}</Eyebrow>
                  <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11.5px] leading-normal whitespace-pre-wrap break-words" data-testid="text-final-state">
                    {JSON.stringify(run.finalState ?? run.currentState, null, 2)}
                  </pre>
                </div>
              </details>
            )}
          </div>

          {selected && (
            <StepDetail
              step={selected}
              stage={selected.stage}
              stepWord={stepWord}
              isMagentic={isMagentic}
              approvalId={approvalId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FileGallery({ files, testIdPrefix }: { files: DeliverableFile[]; testIdPrefix: string }) {
  const images = files.filter(isImage);
  const others = files.filter((f) => !isImage(f));
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {images.map((f, i) => (
            <a key={f.id} href={fileHref(f)} className="group flex flex-col gap-1.5" data-testid={`${testIdPrefix}-${f.id}`}>
              <span className="aspect-[4/3] rounded-md border bg-muted overflow-hidden group-hover:border-foreground transition-colors">
                <img src={fileHref(f)} alt={f.filename || `Image ${i + 1}`} loading="lazy" className="h-full w-full object-contain" />
              </span>
              <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="truncate">{f.filename === "image.png" || !f.filename ? `Image ${i + 1}` : f.filename}</span>
                <Download className="w-3 h-3 shrink-0" />
              </span>
              {f.from && <span className="-mt-1 truncate text-[11px] text-muted-foreground" title={`From ${f.from}`}>from {f.from}</span>}
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((f) => (
            <a
              key={f.id}
              href={fileHref(f)}
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted"
              data-testid={`${testIdPrefix}-${f.id}`}
            >
              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="flex flex-col min-w-0">
                <span className="truncate max-w-[460px]">{f.filename || "Download file"}</span>
                {f.from && <span className="truncate max-w-[460px] text-[11px] text-muted-foreground">from {f.from}</span>}
              </span>
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** A step's output entries as readable markdown, with any leading tool-loop narration folded away. */
function OutputEntries({ entries, testId }: { entries: Array<{ key: string; text: string }>; testId?: string }) {
  return (
    <div className="flex flex-col gap-5" data-testid={testId}>
      {entries.map((e) => {
        const { notes, report } = splitWorkingNotes(e.text);
        return (
          <div key={e.key} className="flex flex-col gap-2">
            {/* The key is only worth showing when there is more than one. */}
            {entries.length > 1 && <Eyebrow>{humanizeKey(e.key)}</Eyebrow>}
            {notes && (
              <details className="group rounded-md border bg-background/60 px-3 py-2 text-xs text-muted-foreground" data-testid="details-working-notes">
                <summary className="cursor-pointer list-none select-none font-mono">
                  <span className="group-open:hidden">Show the agent's working notes</span>
                  <span className="hidden group-open:inline">Hide the agent's working notes</span>
                </summary>
                <p className="mt-2 whitespace-pre-wrap leading-relaxed">{notes}</p>
              </details>
            )}
            <Markdown text={report} className="astra-md run-output text-sm" />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The selected step's own contribution. The run merges every agent's output
 * into one final state, which answers "what did the team produce" but not
 * "what did THIS agent contribute"; this pane answers the second.
 */
function StepDetail({
  step,
  stage,
  stepWord,
  isMagentic,
  approvalId,
}: {
  step: Step;
  stage: Stage;
  stepWord: string;
  isMagentic: boolean;
  approvalId: string | null;
}) {
  const [tab, setTab] = useState<"output" | "files">("output");
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setTab("output"); setCopied(false); setExpanded(false); }, [step.key]);

  const entries = outputEntries(step.result);
  const files = collectRunFiles(step.result?.output);
  const plain = entries.map((e) => (entries.length > 1 ? `## ${humanizeKey(e.key)}\n\n${e.text}` : e.text)).join("\n\n");
  const others = stage.steps.length - 1;
  const decision = step.kind === "gate" ? gateDecision(step.result) : null;
  const showTabs = step.kind === "agent" && step.state === "completed" && files.length > 0;
  const canExpand = step.kind === "agent" && entries.length > 0 && tab === "output";
  // An approval step's outcome is the decision itself, not "completed".
  const pillLabel = step.kind === "gate" && step.state === "completed" && decision ? "Approved"
    : step.kind === "gate" && step.state === "failed" ? "Not approved"
    : STATE_LABEL[step.state];

  // A step that built a web page or an email can be seen as one, in its own tab.
  const htmlDoc = useMemo(() => (step.kind === "agent" ? extractHtmlDocument(plain) : null), [plain, step.kind]);

  async function copyOutput() {
    try {
      await navigator.clipboard.writeText(plain);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked by permissions; the text is on screen and selectable either way.
    }
  }

  let body: React.ReactNode;
  if (step.kind === "gate") {
    body = step.state === "completed" && decision ? (
      <div className="flex gap-3 rounded-lg border bg-background p-3.5">
        <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[hsl(var(--astra-ok))]" />
        <div className="text-sm">
          <div className="font-medium">Approved{decision.decidedBy ? ` by ${decision.decidedBy}` : ""}</div>
          <div className="text-muted-foreground">The run waited {durationLabel(step.durationMs)} for this decision, then continued.</div>
        </div>
      </div>
    ) : step.state === "failed" ? (
      <div className="flex gap-3 rounded-lg border border-[hsl(var(--astra-fail)/0.4)] bg-background p-3.5">
        <XCircle className="w-5 h-5 shrink-0 mt-0.5 text-[hsl(var(--astra-fail))]" />
        <div className="text-sm">
          <div className="font-medium">Not approved</div>
          <div className="text-muted-foreground">{step.error || "The approval was rejected or timed out."}</div>
        </div>
      </div>
    ) : step.state === "waiting" ? (
      <div className="flex gap-3 rounded-lg border border-[hsl(var(--astra-volt))] bg-[hsl(var(--astra-volt)/0.1)] p-3.5">
        <Hand className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-sm flex flex-col gap-2.5">
          <div>
            <div className="font-medium">Waiting for a decision</div>
            <div className="text-muted-foreground">Waiting {durationLabel(step.durationMs)} so far. The run continues once a person approves or rejects it.</div>
          </div>
          {approvalId && (
            <Link href={`/approvals/${approvalId}`}>
              <Button size="sm" className="self-start" data-testid="button-review-approval-detail">Review and decide <ArrowRight className="w-3.5 h-3.5 ml-1.5" /></Button>
            </Link>
          )}
        </div>
      </div>
    ) : step.state === "skipped" ? (
      <p className="text-sm text-muted-foreground">This approval didn't run: no condition leading into it was met.</p>
    ) : (
      <p className="text-sm text-muted-foreground">This approval starts when the steps before it finish.</p>
    );
  } else if (step.state === "pending") {
    body = <p className="text-sm text-muted-foreground">Not started. It begins when the steps before it finish.</p>;
  } else if (step.state === "running") {
    body = <p className="text-sm text-muted-foreground">Working for {durationLabel(step.durationMs)}. Its output appears here the moment it finishes.</p>;
  } else if (step.state === "skipped") {
    body = <p className="text-sm text-muted-foreground">Didn't run: no condition leading into this step was met.</p>;
  } else if (tab === "files" && files.length > 0) {
    body = <FileGallery files={files} testIdPrefix={`link-node-file-${step.id}`} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {step.state === "failed" && (
          <div className="rounded-lg border border-[hsl(var(--astra-fail)/0.4)] bg-background p-3.5 text-sm" data-testid={`text-node-error-${step.id}`}>
            <div className="font-medium">This step failed</div>
            <div className="text-muted-foreground break-words">{step.error || "No error message was recorded."}</div>
          </div>
        )}
        {isMagentic && step.result?.output?.managerReasoning && (
          <div className="text-sm">
            <Eyebrow>Why the manager chose this step</Eyebrow>
            <p className="mt-1 text-muted-foreground">{step.result.output.managerReasoning}</p>
          </div>
        )}
        {entries.length > 0 ? (
          <OutputEntries entries={entries} testId={`panel-node-output-${step.id}`} />
        ) : step.state === "completed" ? (
          <p className="text-sm text-muted-foreground">This step produced no text output.</p>
        ) : null}
      </div>
    );
  }

  return (
    <aside
      className="rounded-xl border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
      aria-live="polite"
      data-testid="panel-step-detail"
    >
      <div className="px-5 pt-4 pb-3 border-b flex flex-col gap-2">
        <Eyebrow>{stepWord} {stage.number}{stage.revisionRound ? ` · revision ${stage.revisionRound}` : ""}{others > 0 ? ` · ran side by side with ${others} other${others > 1 ? "s" : ""}` : ""}</Eyebrow>
        <h3 className="text-[19px] font-semibold leading-snug" style={DISPLAY} data-testid="text-step-title">{step.label}</h3>
        <div className="flex items-center gap-3.5 flex-wrap font-mono text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border bg-background px-2.5 py-0.5 text-foreground">
            <Dot state={step.state} /> {pillLabel}
          </span>
          {step.durationMs != null && step.state !== "pending" && <span>{durationLabel(step.durationMs)}</span>}
          <span>{step.kind === "gate" ? "Approval step" : "Agent"}</span>
          {canExpand && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2 text-xs font-sans" onClick={() => setExpanded(true)} data-testid="button-expand-output">
              <Maximize2 className="w-3.5 h-3.5 mr-1.5" /> Expand
            </Button>
          )}
        </div>
        {showTabs && (
          <div className="flex gap-1 pt-1" role="tablist">
            {([["output", "Output"], ["files", `Files · ${files.length}`]] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-md px-2.5 py-1.5 text-[13px] ${tab === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                data-testid={`tab-step-${k}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 py-4 overflow-y-auto">{body}</div>
      {(step.stateKey || (entries.length > 0 && tab === "output")) && (
        <div className="border-t px-5 py-2.5 flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
          <span>{step.stateKey ? `saved as ${step.stateKey}` : ""}</span>
          {entries.length > 0 && tab === "output" && step.kind === "agent" && (
            <span className="flex items-center gap-2">
            {htmlDoc && (
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => openHtmlInBrowser(htmlDoc)} data-testid={`button-preview-html-${step.id}`}>
                <ExternalLink className="w-3 h-3 mr-1" /> Open in browser
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={copyOutput} data-testid={`button-copy-output-${step.id}`}>
              {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
              {copied ? "Copied" : "Copy output"}
            </Button>
            </span>
          )}
        </div>
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="astra-scope bg-background text-foreground font-sans max-w-[min(1100px,94vw)] w-full max-h-[88vh] flex flex-col gap-0 p-0 overflow-hidden" data-testid="dialog-step-output">
          <DialogHeader className="px-6 pt-5 pb-3 border-b text-left space-y-1">
            <Eyebrow>{stepWord} {stage.number}{stage.revisionRound ? ` · revision ${stage.revisionRound}` : ""} · {durationLabel(step.durationMs)}</Eyebrow>
            <DialogTitle className="text-xl font-semibold" style={DISPLAY}>{step.label}</DialogTitle>
            <DialogDescription className="sr-only">What this step produced</DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5 overflow-y-auto">
            <div className="max-w-[90ch]"><OutputEntries entries={entries} /></div>
          </div>
          <div className="border-t px-6 py-3 flex justify-end gap-2">
            {htmlDoc && (
              <Button size="sm" onClick={() => openHtmlInBrowser(htmlDoc)} data-testid="button-preview-html-expanded">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Open in browser
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={copyOutput} data-testid="button-copy-output-expanded">
              {copied ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copied ? "Copied" : "Copy output"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
