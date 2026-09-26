/**
 * "That was wrong" — said where it happened.
 *
 * Cowork had no way to react to an answer. The platform has a Feedback page
 * and a store behind it, but the only route in was a form on another screen,
 * which means describing from memory an answer you are looking at.
 *
 * So a rating goes into that same store rather than a new one: the Feedback
 * page already reads it, and feedback about Cowork shouldn't live somewhere
 * the people who triage feedback don't look.
 *
 * What is recorded is the rating, the note if one was written, and enough of
 * the exchange to act on it — the question, and the beginning of the answer.
 * The card in the UI says that before it sends anything.
 */
import { db } from "../db";
import { feedbackItems } from "@shared/schema";
import type { AstraMessageRecord } from "./types";
import type { ThreadSummary } from "./store";

export class MessageFeedbackError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface FeedbackStore {
  getThreadForCaller(threadId: string, orgId: string, userId: string | null): Promise<{ thread: ThreadSummary; messages: AstraMessageRecord[] } | null>;
}

/** How much of an answer is worth keeping with the rating. */
export const EXCERPT_CHARS = 600;

/** One line of context, trimmed. */
export function excerpt(markdown: string, limit = EXCERPT_CHARS): string {
  const text = (markdown ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * What the Feedback page will show. It leads with the verdict, then the note,
 * then what was being answered -- so a triager reads the complaint before the
 * transcript.
 */
export function feedbackText(rating: "up" | "down", note: string | null, asked: string | null, answered: string): string {
  const lines = [rating === "up" ? "Rated helpful in Astra Cowork." : "Rated not helpful in Astra Cowork."];
  if (note?.trim()) lines.push("", `What they said: ${note.trim()}`);
  if (asked) lines.push("", `They asked: ${excerpt(asked, 300)}`);
  lines.push("", `Astra answered: ${excerpt(answered)}`);
  return lines.join("\n");
}

export async function recordMessageFeedback(
  store: FeedbackStore,
  actor: { orgId: string; userId: string | null; actorLabel: string },
  input: { threadId: string; messageId: string; rating: "up" | "down"; note?: string | null },
) {
  const found = await store.getThreadForCaller(input.threadId, actor.orgId, actor.userId);
  if (!found) throw new MessageFeedbackError("No conversation with that id that you can open.", 404);
  const message = found.messages.find((m) => m.id === input.messageId);
  if (!message) throw new MessageFeedbackError("No message with that id in this conversation.", 404);
  if (message.role !== "astra") throw new MessageFeedbackError("Only Astra's answers can be rated.", 400);

  // The question this answered: the last thing the person said before it.
  const before = found.messages.slice(0, found.messages.indexOf(message));
  const asked = [...before].reverse().find((m) => m.role === "user")?.markdown ?? null;

  const [created] = await db
    .insert(feedbackItems)
    .values({
      feedbackType: input.rating === "up" ? "general" : "bug",
      featureArea: "Astra Cowork",
      // Where it came from, so a triager can open the conversation itself.
      subFeature: `conversation ${input.threadId}`,
      feedbackText: feedbackText(input.rating, input.note ?? null, asked, message.markdown),
      submittedBy: actor.actorLabel,
      status: "open",
    })
    .returning();

  return { recorded: true, id: created?.id ?? null, rating: input.rating };
}
