/**
 * Documents a team run is given at the start.
 *
 * A state field of type `file` is an input the Run form collects as an upload
 * rather than as text. What lands in the run's state is a DESCRIPTOR -- the
 * file's id, name, kind and how much text was read from it -- never the text
 * itself. State is copied into every wave result and rendered into every node
 * that can see the key, so a 500k-character extraction placed there would ride
 * along on each of them; the same reason fetch_submission returns a schedule
 * summary and leaves the 120 location rows to a separate call.
 *
 * The text reaches a model a different way: an agent node that can SEE the
 * field (visibleStateKeys decides that, exactly as it does for every other
 * key) gets the document's contents appended to its prompt. A node that cannot
 * see the field is not paying for the document.
 *
 * What this module will not do is let a document fail quietly. A scanned PDF
 * extracts to nothing today -- there is no OCR in this platform yet -- and a
 * run given one must say so, in the descriptor the steps read and in the text
 * the model is shown. An empty extraction that reads as an empty document is
 * the difference between "this invoice has no total" and "nobody read this
 * invoice".
 */
import { readAttachedFiles, buildAttachmentContext } from "./attachment-context";
import { FILE_INPUT_TYPE } from "@shared/run-input";
import type { StateFieldDef } from "./dag-execution-engine";

/**
 * What a step sees in state for a document. Flat on purpose: a routing rule
 * parses one clause of the form `field.property op value`, so `sov.readable
 * == false` is a rule the engine settles itself, while anything nested deeper
 * would not parse and would silently become a model call.
 */
export interface RunDocument {
  fileId: string;
  filename: string;
  /** pdf | docx | xlsx | pptx | csv | json | text, as the reader classified it. */
  kind: string | null;
  sizeBytes: number | null;
  /** Characters of text the reader got out of the file. 0 means nothing. */
  chars: number;
  /** False when no text could be read -- a scan, an image-only PDF, an empty file. */
  readable: boolean;
  /** True when the reader stopped early: what the steps see is a partial document. */
  truncated: boolean;
  /** Present only when something is wrong, and written for a human to act on. */
  note?: string;
}

/** How much of one document to inline per node. Generous -- the document IS
 *  the work here, unlike a brand asset -- but not unbounded, because a step
 *  that cannot fit its own instructions alongside the document fails in a way
 *  that looks like the document was never given. */
export const RUN_DOCUMENT_PREVIEW_CHARS = 120_000;

const UNREADABLE_NOTE =
  "No text could be read from this file. It is most likely a scan or an image-only PDF, which this platform cannot read yet. Do not treat it as an empty document.";

/** The names of every `file` input field in a team's state schema. */
export function fileInputFieldNames(stateSchema: Record<string, StateFieldDef> | null | undefined): string[] {
  if (!stateSchema) return [];
  return Object.entries(stateSchema)
    .filter(([, def]) => def?.type === FILE_INPUT_TYPE)
    .map(([name]) => name);
}

/** Whether a value in state is one of these descriptors. */
export function isRunDocument(value: unknown): value is RunDocument {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && typeof (value as RunDocument).fileId === "string"
    && typeof (value as RunDocument).filename === "string";
}

/**
 * Turn the file ids a run was given into descriptors, in the organization that
 * owns the run. An id that names no file IN THAT ORGANIZATION comes back in
 * `missing` -- the caller answers 400 rather than starting a run whose document
 * field holds a dangling id.
 */
export async function resolveRunDocuments(
  fileIds: string[],
  orgId?: string,
): Promise<{ documents: RunDocument[]; missing: string[] }> {
  const wanted = Array.from(new Set(fileIds.filter((id) => typeof id === "string" && id.trim())));
  if (!wanted.length) return { documents: [], missing: [] };

  const rows = await readAttachedFiles(wanted, orgId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const documents: RunDocument[] = [];
  const missing: string[] = [];

  for (const id of wanted) {
    const row = byId.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    const text = (row.extractedText ?? "").trim();
    const meta = (row.extractMeta as Record<string, unknown> | null) ?? {};
    const truncated = meta.truncated === true;
    documents.push({
      fileId: row.id,
      filename: row.filename,
      kind: row.kind ?? null,
      sizeBytes: row.sizeBytes ?? null,
      chars: text.length,
      readable: text.length > 0,
      truncated,
      ...(text.length === 0
        ? { note: UNREADABLE_NOTE }
        : truncated
          ? { note: "Only part of this file could be read; what the steps are given is incomplete." }
          : {}),
    });
  }

  return { documents, missing };
}

/**
 * The descriptors sitting in a run's state, optionally narrowed to the keys one
 * node can see. Reads the schema rather than sniffing the value's shape, so a
 * step that happens to write an object with a `fileId` is not mistaken for a
 * document the run was given.
 */
export function runDocumentsInState(
  stateSchema: Record<string, StateFieldDef> | null | undefined,
  state: Record<string, unknown>,
  visibleKeys?: Set<string>,
): Array<{ field: string; document: RunDocument }> {
  const out: Array<{ field: string; document: RunDocument }> = [];
  for (const field of fileInputFieldNames(stateSchema)) {
    if (visibleKeys && !visibleKeys.has(field)) continue;
    const value = state[field];
    if (isRunDocument(value)) out.push({ field, document: value });
  }
  return out;
}

/**
 * The prompt block for the documents a node can see: the reader's text for the
 * ones that have text, and a plain statement for the ones that do not.
 *
 * An unreadable document is NOT dropped from the block. A step told only about
 * the documents that worked would answer from the rest and never mention the
 * one it could not read.
 */
export async function buildRunDocumentContext(
  documents: RunDocument[],
  orgId?: string,
): Promise<string> {
  if (!documents.length) return "";

  const readable = documents.filter((d) => d.readable);
  const unreadable = documents.filter((d) => !d.readable);

  const sections: string[] = [];

  if (readable.length) {
    const { context } = await buildAttachmentContext(
      readable.map((d) => d.fileId),
      orgId,
      [
        "This run was given the following document(s). Their contents are reproduced below.",
        "Work from them. If a document is marked as partial, say so in your output rather than treating what you were given as the whole document.",
      ],
      RUN_DOCUMENT_PREVIEW_CHARS,
    );
    if (context) sections.push(context);
  }

  if (unreadable.length) {
    sections.push(
      [
        readable.length
          ? "The run was also given the following document(s), which could NOT be read:"
          : "This run was given the following document(s), which could NOT be read:",
        ...unreadable.map((d) => `- ${d.filename}${d.kind ? ` (${d.kind})` : ""}: ${d.note ?? UNREADABLE_NOTE}`),
        "",
        "Do not infer their contents. If your step needs what is in them, say that it could not be read and stop there.",
      ].join("\n"),
    );
  }

  return sections.join("\n\n");
}
