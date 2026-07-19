/**
 * Live event stream for DAG execution runs.
 *
 * The run monitor used to poll the run row and could only show "wave 3/7" —
 * no per-step activity and no outputs until the final write. This module is
 * the missing link: executeTeamAgentDagRun publishes an event for every step
 * start/finish, gate pause, wave completion, and run end, and the SSE route
 * (GET /api/dag-execution-runs/:id/events) replays the buffer to late
 * subscribers and then streams live.
 *
 * Purely in-memory by design: events are a real-time projection of state that
 * is already durably persisted on the run row (waveResults, currentState) —
 * after a server restart the monitor still has the persisted timeline, it
 * just won't replay the transient step-by-step feed for finished waves.
 */

export interface DagRunEvent {
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
  approvalId?: string;
  runStatus?: string;
}

const BUFFER_CAP = 500;
const CLEANUP_DELAY_MS = 10 * 60 * 1000;

const buffers = new Map<string, DagRunEvent[]>();
const listeners = new Map<string, Set<(e: DagRunEvent) => void>>();

export function publishDagRunEvent(runId: string, event: Omit<DagRunEvent, "ts">): void {
  const full: DagRunEvent = { ...event, ts: new Date().toISOString() };
  let buf = buffers.get(runId);
  if (!buf) {
    buf = [];
    buffers.set(runId, buf);
  }
  buf.push(full);
  if (buf.length > BUFFER_CAP) buf.splice(0, buf.length - BUFFER_CAP);
  (listeners.get(runId) ?? new Set()).forEach((fn) => {
    try { fn(full); } catch { /* subscriber gone */ }
  });
  if (event.type === "run_complete") {
    // Keep the feed around briefly so a monitor opened right after the run
    // ends still gets the full story, then free the memory.
    setTimeout(() => { buffers.delete(runId); listeners.delete(runId); }, CLEANUP_DELAY_MS).unref?.();
  }
}

export function getDagRunEventBuffer(runId: string): DagRunEvent[] {
  return buffers.get(runId) ?? [];
}

export function subscribeDagRunEvents(runId: string, fn: (e: DagRunEvent) => void): () => void {
  let set = listeners.get(runId);
  if (!set) {
    set = new Set();
    listeners.set(runId, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(runId);
  };
}

/** Compact, human-scannable preview of a node's output for the live feed. */
export function previewOutput(output: Record<string, unknown> | undefined, max = 260): string | undefined {
  if (!output || Object.keys(output).length === 0) return undefined;
  try {
    const s = JSON.stringify(output);
    return s.length > max ? s.slice(0, max) + "…" : s;
  } catch {
    return undefined;
  }
}
