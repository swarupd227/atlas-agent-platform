/**
 * Database-backed ThreadStore for Astra threads, plus the thread management
 * the routes need (create, list, read with messages).
 *
 * Scoping: every statement filters by organization. Threads are personal --
 * a thread started by one user is only listed for and opened by that user
 * (canAccessThread), even within the same organization.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { astraMessages, astraThreads, type AstraMessage, type AstraThread } from "@shared/schema";
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
import { canAccessThread } from "./access";

export { canAccessThread };

const STALE_RUNNING_MINUTES = 10;
const DEFAULT_TITLE = "New conversation";

export interface ThreadSummary {
  id: string;
  title: string;
  status: ThreadStatus;
  outcomeId: string | null;
  pendingAction: PendingAction | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toState(row: { id: string; organization_id?: string; organizationId?: string; status: string; checkpoint: unknown; pending_action?: unknown; pendingAction?: unknown }): ThreadState {
  return {
    id: row.id,
    orgId: (row.organizationId ?? row.organization_id) as string,
    status: row.status as ThreadStatus,
    checkpoint: ((row.checkpoint as Checkpoint | null) ?? emptyCheckpoint()),
    pendingAction: ((row.pendingAction ?? row.pending_action) as PendingAction | null) ?? null,
  };
}

export function toMessageRecord(row: AstraMessage): AstraMessageRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    role: row.role as AstraMessageRecord["role"],
    markdown: row.markdown,
    artifacts: (row.artifacts as AstraMessageRecord["artifacts"]) ?? [],
    sources: (row.sources as AstraMessageRecord["sources"]) ?? [],
    suggestions: (row.suggestions as AstraMessageRecord["suggestions"]) ?? [],
    proof: (row.proof as AstraMessageRecord["proof"]) ?? null,
    pendingAction: (row.pendingAction as AstraMessageRecord["pendingAction"]) ?? null,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  };
}

function toSummary(row: AstraThread): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ThreadStatus,
    outcomeId: row.outcomeId,
    pendingAction: (row.pendingAction as PendingAction | null) ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export class DbThreadStore implements ThreadStore {
  async loadThread(threadId: string, orgId: string): Promise<ThreadState | null> {
    const [row] = await db.select().from(astraThreads).where(and(eq(astraThreads.id, threadId), eq(astraThreads.organizationId, orgId)));
    return row ? toState(row) : null;
  }

  async acquireTurn(threadId: string, orgId: string): Promise<boolean> {
    const result = await db.execute(sql`
      UPDATE astra_threads
      SET status = 'running', updated_at = now()
      WHERE id = ${threadId}
        AND organization_id = ${orgId}
        AND (
          status IN ('idle', 'failed')
          OR (status = 'running' AND updated_at < now() - (${STALE_RUNNING_MINUTES} * interval '1 minute'))
        )
      RETURNING id
    `);
    return (result.rows?.length ?? 0) > 0;
  }

  async saveState(threadId: string, orgId: string, state: { status: ThreadStatus; checkpoint: Checkpoint; pendingAction: PendingAction | null }): Promise<void> {
    await db
      .update(astraThreads)
      .set({ status: state.status, checkpoint: state.checkpoint, pendingAction: state.pendingAction, updatedAt: new Date() })
      .where(and(eq(astraThreads.id, threadId), eq(astraThreads.organizationId, orgId)));
  }

  async claimPendingAction(threadId: string, orgId: string, actionId: string): Promise<ThreadState | null> {
    // Read the pre-update row and clear it in one statement: only one of two
    // concurrent Confirms can match status + action id.
    const result = await db.execute(sql`
      WITH claimed AS (
        SELECT id, organization_id, status, checkpoint, pending_action
        FROM astra_threads
        WHERE id = ${threadId}
          AND organization_id = ${orgId}
          AND status = 'awaiting_confirmation'
          AND pending_action->>'id' = ${actionId}
        FOR UPDATE
      )
      UPDATE astra_threads t
      SET status = 'running', pending_action = NULL, updated_at = now()
      FROM claimed
      WHERE t.id = claimed.id
      RETURNING claimed.id, claimed.organization_id, claimed.status, claimed.checkpoint, claimed.pending_action
    `);
    const row = result.rows?.[0] as any;
    return row ? toState(row) : null;
  }

  async appendMessage(orgId: string, message: NewMessage): Promise<AstraMessageRecord> {
    const [row] = await db
      .insert(astraMessages)
      .values({
        threadId: message.threadId,
        organizationId: orgId,
        role: message.role,
        markdown: message.markdown,
        artifacts: message.artifacts,
        sources: message.sources,
        suggestions: message.suggestions,
        proof: message.proof,
        pendingAction: message.pendingAction,
      })
      .returning();
    return toMessageRecord(row);
  }

  async markActionDecided(orgId: string, messageId: string, decision: PendingDecision): Promise<void> {
    await db.execute(sql`
      UPDATE astra_messages
      SET pending_action = pending_action || jsonb_build_object('decision', ${decision}::text)
      WHERE id = ${messageId} AND organization_id = ${orgId} AND pending_action IS NOT NULL
    `);
  }

  // ── Thread management (routes) ────────────────────────────────────────────

  async createThread(orgId: string, userId: string | null, title?: string): Promise<ThreadSummary> {
    const [row] = await db
      .insert(astraThreads)
      .values({ organizationId: orgId, actorUserId: userId, title: title?.trim() || DEFAULT_TITLE, checkpoint: emptyCheckpoint() })
      .returning();
    return toSummary(row);
  }

  async listThreads(orgId: string, userId: string | null, limit = 50): Promise<ThreadSummary[]> {
    const scope = userId
      ? and(eq(astraThreads.organizationId, orgId), eq(astraThreads.actorUserId, userId))
      : eq(astraThreads.organizationId, orgId);
    const rows = await db.select().from(astraThreads).where(scope).orderBy(desc(astraThreads.updatedAt)).limit(limit);
    return rows.map(toSummary);
  }

  /** The thread and its messages, or null if the caller may not open it. */
  async getThreadForCaller(threadId: string, orgId: string, userId: string | null): Promise<{ thread: ThreadSummary; messages: AstraMessageRecord[] } | null> {
    const [row] = await db.select().from(astraThreads).where(and(eq(astraThreads.id, threadId), eq(astraThreads.organizationId, orgId)));
    if (!row || !canAccessThread({ organizationId: row.organizationId, actorUserId: row.actorUserId }, { orgId, userId })) return null;
    const messages = await db
      .select()
      .from(astraMessages)
      .where(and(eq(astraMessages.threadId, threadId), eq(astraMessages.organizationId, orgId)))
      .orderBy(asc(astraMessages.createdAt));
    return { thread: toSummary(row), messages: messages.map(toMessageRecord) };
  }

  /** Name a new thread after its first message. */
  async titleIfDefault(threadId: string, orgId: string, firstMessage: string): Promise<void> {
    const text = firstMessage.replace(/\s+/g, " ").trim();
    if (!text) return;
    const title = text.length > 60 ? `${text.slice(0, 57)}…` : text;
    await db
      .update(astraThreads)
      .set({ title })
      .where(and(eq(astraThreads.id, threadId), eq(astraThreads.organizationId, orgId), eq(astraThreads.title, DEFAULT_TITLE)));
  }
}
