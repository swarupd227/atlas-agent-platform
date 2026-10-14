import { db } from "./db";
import { uploadedFiles } from "@shared/schema";
import { inArray, and, eq } from "drizzle-orm";
import { ATTACHMENT_TOOL_GUIDE, DEFAULT_ATTACHMENT_BUDGET_CHARS, documentMap, loadSections, selectSections } from "./attachment-sections";

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
  const omitted = typeof meta.coverage?.omitted === "string" ? meta.coverage.omitted : null;
  return [
    meta.sheets?.length ? `sheets: ${meta.sheets.join(", ")}` : null,
    typeof meta.slides === "number" ? `${meta.slides} slides` : null,
    typeof meta.pages === "number" ? `${meta.pages} pages` : null,
    meta.truncated ? `TRUNCATED — this is a partial reading of a large file${omitted ? `: ${omitted}` : ""}` : null,
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
  /**
   * Per-file cap on the inlined text. Unset = whole extraction while the turn's
   * attachments fit `options.budgetChars`, which is right for a user's own
   * per-message attachment (the text IS the evidence); past it, the relevant
   * sections plus a statement of what was not shown. Set it
   * for files that ride along as resources -- brand assets in particular: the
   * bytes are already in the code-execution container, so the inlined text is
   * only orientation. Five assets can be anything up to the 25MB upload cap
   * each (a long PDF extracts to hundreds of thousands of chars), and their
   * text would otherwise ride along on every document-capable run unbounded.
   */
  maxCharsPerFile?: number,
  /**
   * For a user's own attachments (no maxCharsPerFile): the question they came
   * with, which sections of an oversized file are chosen for; the turn's
   * budget; and whether the model has search_attachment and
   * read_attachment_section to reach the rest.
   */
  options: AttachmentContextOptions = {},
): Promise<{ context: string; names: string[]; partial: string[] }> {
  const ordered = await readAttachedFiles(fileIds, orgId);
  if (!ordered.length) return { context: "", names: [], partial: [] };

  const partial: string[] = [];
  let bodies: string[];
  if (maxCharsPerFile) {
    bodies = ordered.map((f) => {
      const full = (f.extractedText ?? "").trim();
      if (full.length <= maxCharsPerFile) return full;
      return `${full.slice(0, maxCharsPerFile)}\n[… preview only: ${maxCharsPerFile} of ${full.length} characters shown; the complete file is available to you as an uploaded file …]`;
    });
  } else {
    bodies = await budgetedBodies(ordered, options, partial);
  }

  return {
    context: [
      ...(framing ?? [
        "The user attached the following file(s). Their contents are reproduced below.",
        "Base your answer on them; if a file appears truncated or unreadable, say so rather than guessing at what it might contain.",
      ]),
      "",
      ...ordered.map((f, i) => renderBlock(f, bodies[i])),
    ].join("\n"),
    names: ordered.map((f) => f.filename),
    partial,
  };
}

export interface AttachmentContextOptions {
  query?: string;
  budgetChars?: number;
  toolsAvailable?: boolean;
}

/**
 * Every file whole while the turn's attachments fit the budget -- what a
 * small attachment has always been. Past it, the budget is shared (a short
 * file keeps its whole text, the rest split what remains) and each file that
 * still does not fit is shown as its map, opening and most relevant
 * sections, with what was left out said in words.
 */
async function budgetedBodies(files: UploadedFileRow[], options: AttachmentContextOptions, partial: string[]): Promise<string[]> {
  const budget = Math.max(4_000, options.budgetChars ?? DEFAULT_ATTACHMENT_BUDGET_CHARS);
  const full = files.map((f) => (f.extractedText ?? "").trim());
  const total = full.reduce((n, t) => n + t.length, 0);
  if (total <= budget) return full;

  const allowance = new Array<number>(files.length).fill(0);
  let remaining = budget;
  const bySize = files.map((_, i) => i).sort((a, b) => full[a].length - full[b].length);
  bySize.forEach((i, k) => {
    const share = Math.floor(remaining / (bySize.length - k));
    allowance[i] = Math.min(full[i].length, share);
    remaining -= allowance[i];
  });

  const out: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (full[i].length <= allowance[i]) {
      out.push(full[i]);
      continue;
    }
    const { sections } = await loadSections(f);
    const sel = selectSections(sections, options.query ?? "", Math.max(2_000, allowance[i]));
    partial.push(f.filename);
    const reach = options.toolsAvailable
      ? `${ATTACHMENT_TOOL_GUIDE} Search the file before concluding that something is not in it.`
      : "The sections not shown were not given to you: if the answer may depend on them, say so rather than guessing.";
    console.log(
      `[attachments] file=${f.id} name="${f.filename}" sections=${sel.total} shown=${sel.shown.length} ` +
      `chars=${sel.charsShown}/${sel.charsTotal} budget=${allowance[i]} tools=${options.toolsAvailable === true}`,
    );
    out.push([
      `[Large file, shown in part: ${sel.shown.length} of its ${sel.total} sections (${sel.charsShown.toLocaleString("en-US")} of ${sel.charsTotal.toLocaleString("en-US")} characters) — ` +
        `the opening and the sections that best match the question, in document order. ${reach}]`,
      `Document map: ${documentMap(sections)}`,
      "",
      sel.text,
    ].join("\n"));
  }
  return out;
}

/**
 * How much of a brand asset's text to inline as orientation. Five assets at
 * this cap stay under ~8k tokens, leaving the request's budget for the actual
 * work; the files themselves ride in the container in full.
 */
export const BRAND_ASSET_PREVIEW_CHARS = 6_000;

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
