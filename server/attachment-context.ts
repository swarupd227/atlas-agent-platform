import { db } from "./db";
import { uploadedFiles } from "@shared/schema";
import { inArray, and, eq } from "drizzle-orm";

/**
 * Turning uploaded_files rows into text an LLM can use. Every surface that
 * accepts an attachment reads through here, so "which files may this caller
 * see" is decided in exactly one place.
 *
 * The FETCH is shared; the FRAMING is not. A file attached to a Workspace chat
 * is evidence for answering a question ("base your answer on them"), while a
 * file attached to the agent wizard is source material to be turned into a
 * configuration. Wrapping an SOP in chat framing would tell the drafter to
 * answer the SOP rather than build from it, so the two callers share
 * readAttachedFiles() and render their own prose around it.
 */

type UploadedFileRow = typeof uploadedFiles.$inferSelect;

/**
 * Files by id, scoped to the org and returned in the order the caller listed
 * them. Reading from the DB rather than trusting the request body is the whole
 * point: a caller cannot inject arbitrary "attachment" text into an agent's
 * context by hand-crafting ids, and cannot reach another org's uploads.
 */
export async function readAttachedFiles(fileIds: string[], orgId?: string): Promise<UploadedFileRow[]> {
  if (!fileIds.length) return [];

  const rows = await db.select().from(uploadedFiles).where(
    orgId
      ? and(inArray(uploadedFiles.id, fileIds), eq(uploadedFiles.organizationId, orgId))
      : inArray(uploadedFiles.id, fileIds),
  );

  // Preserve the order the user attached them in; the DB returns arbitrary order.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return fileIds.map((id) => byId.get(id)).filter(Boolean) as UploadedFileRow[];
}

/** "sheets: Q3, Notes; TRUNCATED — …" — what the reader knows about the file
 *  beyond its text. Declared to the model so it can qualify its own answer. */
function describeFile(file: UploadedFileRow): string {
  const meta = (file.extractMeta as any) ?? {};
  return [
    meta.sheets?.length ? `sheets: ${meta.sheets.join(", ")}` : null,
    typeof meta.slides === "number" ? `${meta.slides} slides` : null,
    meta.truncated ? "TRUNCATED — this is a partial reading of a large file" : null,
  ].filter(Boolean).join("; ");
}

function renderBlock(file: UploadedFileRow, text: string): string {
  const detail = describeFile(file);
  return [
    `--- Attached file: ${file.filename}${detail ? ` (${detail})` : ""} ---`,
    text.trim() || "(no readable text in this file)",
    `--- end of ${file.filename} ---`,
  ].join("\n");
}

/**
 * Workspace-chat framing: the files are evidence for the user's question.
 * `framing` overrides the preface for callers whose files are NOT a user's
 * per-message attachments — standing brand assets, for instance, need to be
 * introduced as what they are, or the model treats a logo as the subject of
 * the question instead of a resource for the answer.
 */
export async function buildAttachmentContext(
  fileIds: string[],
  orgId?: string,
  framing?: string[],
): Promise<{ context: string; names: string[] }> {
  const ordered = await readAttachedFiles(fileIds, orgId);
  if (!ordered.length) return { context: "", names: [] };

  return {
    context: [
      ...(framing ?? [
        "The user attached the following file(s). Their contents are reproduced below.",
        "Base your answer on them; if a file appears truncated or unreadable, say so rather than guessing at what it might contain.",
      ]),
      "",
      ...ordered.map((f) => renderBlock(f, f.extractedText ?? "")),
    ].join("\n"),
    names: ordered.map((f) => f.filename),
  };
}

/**
 * Authoring framing: the files are source documents (an SOP, a process
 * write-up, a policy) to be turned into a configuration.
 *
 * Bounded, because these feed a single prompt alongside the platform's whole
 * resource catalogue -- an unbounded 500k-char SOP would crowd out the very
 * lists the drafter must choose from and is the difference between a grounded
 * draft and a hallucinated one. The budget is split evenly so one long file
 * cannot starve the others, and any cut is declared in-band: a drafter that
 * knows it saw a partial document can say so, where a silent cut just produces
 * a confidently incomplete agent.
 */
export async function buildSourceDocuments(
  fileIds: string[],
  orgId: string | undefined,
  maxChars = 40_000,
): Promise<{ text: string; names: string[]; truncated: string[] }> {
  const ordered = await readAttachedFiles(fileIds, orgId);
  if (!ordered.length) return { text: "", names: [], truncated: [] };

  const perFile = Math.max(1_000, Math.floor(maxChars / ordered.length));
  const truncated: string[] = [];

  const blocks = ordered.map((f) => {
    const full = (f.extractedText ?? "").trim();
    const cut = full.length > perFile;
    if (cut) truncated.push(f.filename);
    const body = cut
      ? `${full.slice(0, perFile)}\n[… truncated at ${perFile} characters of ${full.length} …]`
      : full;
    return renderBlock(f, body);
  });

  return {
    text: [
      "The following document(s) were provided as the source for this request.",
      "Treat them as the specification to work from. Where a document is marked truncated,",
      "say so in your reasoning rather than inventing the missing parts.",
      "",
      ...blocks,
    ].join("\n"),
    names: ordered.map((f) => f.filename),
    truncated,
  };
}
