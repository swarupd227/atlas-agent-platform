/**
 * In-memory ThreadStore with the same semantics as the database store: every
 * read and write is scoped by organization, turns are locked, and resuming a
 * pending action is a compare-and-swap. Used by tests and the scripted demo
 * brain; production uses server/astra/store.ts.
 */
import { randomUUID } from "crypto";
import type {
  AstraMessageRecord,
  Checkpoint,
  NewMessage,
  PendingAction,
  PendingDecision,
  ThreadState,
  ThreadStatus,
  ThreadStore,
} from "./types";
import { emptyCheckpoint } from "./engine";

interface StoredThread {
  id: string;
  orgId: string;
  status: ThreadStatus;
  checkpoint: Checkpoint;
  pendingAction: PendingAction | null;
  updatedAt: number;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class MemoryThreadStore implements ThreadStore {
  readonly threads = new Map<string, StoredThread>();
  readonly messages: Array<AstraMessageRecord & { orgId: string }> = [];

  constructor(private readonly staleMs = 10 * 60_000, private readonly now: () => number = Date.now) {}

  createThread(orgId: string, id: string = randomUUID()): string {
    this.threads.set(id, { id, orgId, status: "idle", checkpoint: emptyCheckpoint(), pendingAction: null, updatedAt: this.now() });
    return id;
  }

  private scoped(threadId: string, orgId: string): StoredThread | undefined {
    const t = this.threads.get(threadId);
    return t && t.orgId === orgId ? t : undefined;
  }

  async loadThread(threadId: string, orgId: string): Promise<ThreadState | null> {
    const t = this.scoped(threadId, orgId);
    if (!t) return null;
    return { id: t.id, orgId: t.orgId, status: t.status, checkpoint: clone(t.checkpoint), pendingAction: clone(t.pendingAction) };
  }

  async acquireTurn(threadId: string, orgId: string): Promise<boolean> {
    const t = this.scoped(threadId, orgId);
    if (!t) return false;
    const staleRunning = t.status === "running" && this.now() - t.updatedAt > this.staleMs;
    if (!(t.status === "idle" || t.status === "failed" || staleRunning)) return false;
    t.status = "running";
    t.updatedAt = this.now();
    return true;
  }

  async saveState(threadId: string, orgId: string, state: { status: ThreadStatus; checkpoint: Checkpoint; pendingAction: PendingAction | null }): Promise<void> {
    const t = this.scoped(threadId, orgId);
    if (!t) throw new Error("Thread not found");
    t.status = state.status;
    t.checkpoint = clone(state.checkpoint);
    t.pendingAction = clone(state.pendingAction);
    t.updatedAt = this.now();
  }

  async claimPendingAction(threadId: string, orgId: string, actionId: string): Promise<ThreadState | null> {
    const t = this.scoped(threadId, orgId);
    if (!t || t.status !== "awaiting_confirmation" || t.pendingAction?.id !== actionId) return null;
    const before: ThreadState = { id: t.id, orgId: t.orgId, status: t.status, checkpoint: clone(t.checkpoint), pendingAction: clone(t.pendingAction) };
    t.status = "running";
    t.pendingAction = null;
    t.updatedAt = this.now();
    return before;
  }

  async appendMessage(orgId: string, message: NewMessage): Promise<AstraMessageRecord> {
    const record: AstraMessageRecord & { orgId: string } = {
      ...clone(message),
      id: randomUUID(),
      createdAt: new Date(this.now()).toISOString(),
      orgId,
    };
    this.messages.push(record);
    const { orgId: _omit, ...view } = record;
    return clone(view);
  }

  async markActionDecided(orgId: string, messageId: string, decision: PendingDecision): Promise<void> {
    const m = this.messages.find((x) => x.id === messageId && x.orgId === orgId);
    if (m?.pendingAction) m.pendingAction = { ...m.pendingAction, decision };
  }

  threadMessages(threadId: string): AstraMessageRecord[] {
    return this.messages.filter((m) => m.threadId === threadId);
  }
}
