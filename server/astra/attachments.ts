/**
 * Files attached to a Cowork message.
 *
 * Cowork could not take a file at all: the one surface where "here is the
 * spreadsheet, what does it mean for my agents" is the natural thing to say
 * had no way to say it.
 *
 * Nothing here parses anything. The platform already uploads a file, extracts
 * its text and keeps the bytes (POST /api/files/upload, server/file-extract.ts),
 * and already knows how to frame that text for a model
 * (buildAttachmentContext). This ties those to a conversation:
 *
 *   - a file is uploaded before the message is sent, and possibly before the
 *     conversation exists at all, so it is stamped with the thread id here, on
 *     the message that carries it;
 *   - only files of the caller's organization that aren't already another
 *     conversation's are taken, so one conversation cannot adopt another's;
 *   - the model reads the extracted text, and the transcript shows the names.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { uploadedFiles } from "@shared/schema";
import { buildAttachmentContext } from "../attachment-context";
import type { TurnAttachments } from "./engine";

/** How many files one message may carry. */
export const MAX_PER_MESSAGE = 5;

/**
 * Tie these files to the conversation and return what the turn should see.
 * Ids that aren't the caller's, or that belong to another conversation, are
 * skipped rather than refused: the message is worth sending either way, and
 * the answer will be about the files that did arrive.
 */
export async function attachFilesToThread(fileIds: string[], orgId: string, threadId: string): Promise<TurnAttachments | undefined> {
  // Array.from, not a spread: this project targets ES5 for the server build.
  const ids = Array.from(new Set(fileIds)).slice(0, MAX_PER_MESSAGE);
  if (ids.length === 0) return undefined;

  const claimable = await db
    .update(uploadedFiles)
    .set({ threadId, context: "cowork" })
    .where(
      and(
        inArray(uploadedFiles.id, ids),
        eq(uploadedFiles.organizationId, orgId),
        // Not already another conversation's.
        or(isNull(uploadedFiles.threadId), eq(uploadedFiles.threadId, threadId)),
      ),
    )
    .returning({ id: uploadedFiles.id });

  const mine = new Set(claimable.map((r) => r.id));
  const kept = ids.filter((id) => mine.has(id));
  if (kept.length === 0) return undefined;

  // The whole extracted text: for a file the person attached themselves, the
  // text IS the evidence (see buildAttachmentContext's own note on capping).
  const { context, names } = await buildAttachmentContext(kept, orgId);
  return context ? { context, names } : undefined;
}

/** The files a conversation carries, for its removal plan and its delete. */
export async function threadAttachments(threadId: string, orgId: string | undefined) {
  return db
    .select({ id: uploadedFiles.id, filename: uploadedFiles.filename })
    .from(uploadedFiles)
    .where(orgId ? and(eq(uploadedFiles.threadId, threadId), eq(uploadedFiles.organizationId, orgId)) : eq(uploadedFiles.threadId, threadId));
}

/** Delete them with the conversation they were attached to. */
export async function deleteThreadAttachments(threadId: string, orgId: string | undefined): Promise<number> {
  const rows = await threadAttachments(threadId, orgId);
  if (rows.length === 0) return 0;
  await db.delete(uploadedFiles).where(inArray(uploadedFiles.id, rows.map((r) => r.id)));
  return rows.length;
}
