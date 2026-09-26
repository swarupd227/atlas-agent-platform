/**
 * Deleting a Cowork conversation.
 *
 * Cowork became the default surface and its conversation list only grew:
 * nothing deleted or archived a thread, so every exchange ever started stayed
 * in the rail forever.
 *
 * What makes this different from the platform's other deletes is that almost
 * nothing in a conversation is *in* the conversation. An outcome Astra
 * created, a team it built, an approval the user decided on a card — each of
 * those lives in its own table, and the audit trail records who asked for it.
 * Deleting the thread removes the transcript, not the work, and the dialog
 * says so rather than letting the person imagine they are undoing something.
 */
import { storage } from "../storage";
import { deleteThreadAttachments, threadAttachments } from "./attachments";
import type { AstraMessageRecord } from "./types";
// ThreadSummary is declared by the store, not the engine's type module.
import type { ThreadSummary } from "./store";

/**
 * Only the two calls this needs. `getThreadForCaller` is a DbThreadStore
 * method rather than part of the ThreadStore contract, and typing against the
 * whole store would drag the engine's test doubles in behind it.
 */
export interface ThreadRemovalStore {
  getThreadForCaller(threadId: string, orgId: string, userId: string | null): Promise<{ thread: ThreadSummary; messages: AstraMessageRecord[] } | null>;
  deleteThread(threadId: string, orgId: string, userId: string | null): Promise<boolean | null>;
}

export interface ThreadRemovalPlan {
  id: string;
  name: string;
  goes: string[];
  stays: string[];
  warning: string | null;
}

export class ThreadRemovalError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface ThreadActor {
  orgId: string;
  userId: string | null;
  actorLabel: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What deleting this conversation would take, before anyone confirms. */
export async function planThreadRemoval(store: ThreadRemovalStore, actor: ThreadActor, threadId: string): Promise<ThreadRemovalPlan> {
  const found = await store.getThreadForCaller(threadId, actor.orgId, actor.userId);
  if (!found) throw new ThreadRemovalError("No conversation with that id that you can open.", 404);
  const { thread, messages } = found;

  const attached = await threadAttachments(threadId, actor.orgId);
  const goes = [`${plural(messages.length, "message")} in this conversation`];
  if (attached.length) goes.push(`${plural(attached.length, "attached file")}: ${attached.map((f) => f.filename).join(", ")}`);
  const stays = [
    "anything Astra did here — an outcome created, a team built, an approval you decided — stays",
    "the audit trail keeps who asked for it, and when",
  ];

  return {
    id: thread.id,
    name: thread.title,
    goes,
    stays,
    warning:
      thread.status === "awaiting_confirmation"
        ? "This conversation is waiting on your confirmation. Deleting it drops that request, and nothing it was asking for will be done."
        : thread.status === "running"
          ? "Astra is working in this conversation. It can't be deleted until the turn finishes."
          : null,
  };
}

/** Delete it. Refuses a running turn, and a conversation that isn't the caller's. */
export async function removeThread(store: ThreadRemovalStore, actor: ThreadActor, threadId: string): Promise<{ deleted: true; title: string }> {
  const plan = await planThreadRemoval(store, actor, threadId);
  // The files go with the conversation they were attached to; the message that
  // carried them is about to stop existing.
  await deleteThreadAttachments(threadId, actor.orgId);
  const result = await store.deleteThread(threadId, actor.orgId, actor.userId);
  if (result === null) throw new ThreadRemovalError("No conversation with that id that you can delete.", 404);
  if (result === false) throw new ThreadRemovalError("Astra is working in this conversation. Wait for the turn to finish, then delete it.", 409);

  await storage.createAuditEvent({
    organizationId: actor.orgId,
    actorType: "user",
    actorId: actor.userId ?? actor.actorLabel,
    objectType: "astra_thread",
    objectId: threadId,
    action: "conversation_deleted",
    details: JSON.stringify({ title: plan.name, messages: plan.goes[0], via: "Astra Cowork" }),
  });

  return { deleted: true, title: plan.name };
}
