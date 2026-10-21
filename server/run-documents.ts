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
import { visionPagesFor, visionNote } from "./document-vision";
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
  /**
   * True when this step is given less than the whole document -- whether the
   * reader stopped early OR the text is longer than one step may be handed.
   * This is the field a routing rule should test, because it answers "is what
   * I am looking at the whole thing?", which is the only question that
   * changes what a step may safely conclude.
   */
  truncated: boolean;
  /** Characters actually given to the step, present only when fewer than `chars`. */
  charsShown?: number;
  /**
   * How the step received this document. "text" is the extractor's output;
   * "vision" means the file had no text layer and its pages were rendered and
   * attached as images instead. A step that must distinguish a figure it read
   * from one a model read off a scan can test this, and a reviewer can tell
   * which documents in a run were never machine-readable at all.
   */
  readBy?: "text" | "vision";
  /** Pages rendered and attached, when readBy is "vision". */
  pagesShown?: number;
  /**
   * Pages, for a format that has them. A count only -- the reader knows which
   * page each passage came from (file-extract.ts builds `sections` with a
   * per-page locator) but nothing persists them, so a step can be told a
   * schedule runs to 18 pages and still cannot cite which one a figure is on.
   */
  pages?: number;
  /** Present only when something is wrong, and written for a human to act on. */
  note?: string;
}

/**
 * What a step is given for its documents: prose for the prompt, and the page
 * images a scan was rendered to. The images cannot travel inside the prose --
 * they reach the model as content blocks on the message -- so they come back
 * separately for the engine to pass down.
 */
export interface RunDocumentContext {
  text: string;
  imageFileIds: string[];
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
    const pages = typeof meta.pages === "number" ? meta.pages : undefined;

    // A non-empty string is NOT the same as the document having text.
    //
    // The extractor now returns "" for a PDF whose every page is blank, but
    // this used to read `text.length > 0` and a scan arrived here as the
    // reader's page markers -- "-- 1 of 1 --", 12 characters after trimming.
    // Every field below keyed off that length, so a scan reported
    // `readable: true`, `readBy: "text"`, `chars: 12` and NO note, and the
    // vision gate (`!text`) never opened. Rows extracted before that fix still
    // hold the marker string, so asking `meta.empty` rather than the length is
    // what makes this true for them too -- and it cannot silently re-break if
    // some future reader decides to prepend something of its own.
    const hasText = text.length > 0 && meta.empty !== true;
    const chars = hasText ? text.length : 0;

    // Two different events, and the descriptor used to report only the first.
    //
    // `meta.truncated` is the EXTRACTOR hitting its ceiling. A step is also
    // given less than the whole document when the text is longer than what one
    // step may be handed (RUN_DOCUMENT_PREVIEW_CHARS) -- and that cut happens
    // in buildRunDocumentContext, after this descriptor is written, so nothing
    // used to record it. A 359,214-character schedule reached a step as its
    // first 120,000 characters with `truncated: false` beside it: the prompt
    // said so in words while the field a routing rule reads denied it.
    //
    // `truncated` now means what the STEP got, because that is the question
    // anything downstream is really asking. Which of the two cuts happened is
    // in `note`, and `charsShown` gives the size of what arrived.
    const extractorCut = meta.truncated === true;
    const stepCut = chars > RUN_DOCUMENT_PREVIEW_CHARS;
    const truncated = extractorCut || stepCut;
    const charsShown = Math.min(chars, RUN_DOCUMENT_PREVIEW_CHARS);

    // A PDF with no text layer: render its pages and show them to the model
    // instead. Done HERE, at run setup, rather than when a step's prompt is
    // built, because the descriptor goes into state now and a step routing on
    // `readable` deserves an answer that is already true. Rendering is cached
    // on the file's bytes, so the prompt path re-derives the same ids free.
    //
    // A failure returns null and the document stays honestly unreadable --
    // which is what this platform did before vision existed, so nothing that
    // worked stops working.
    const vision = meta.needsVision === true && !hasText
      ? await visionPagesFor((row as { content?: Buffer | null }).content ?? null, row.filename)
      : null;
    // The extractor already says what it left out and in what unit -- "6 of 18
    // pages, from page 7 on" -- so quote that rather than the vaguer sentence
    // this used to carry. A step told which pages are missing can say so; one
    // told only that something is missing cannot.
    const coverage = (meta.coverage ?? null) as { omitted?: string; unitsKept?: number; unitsTotal?: number } | null;
    documents.push({
      fileId: row.id,
      filename: row.filename,
      kind: row.kind ?? null,
      sizeBytes: row.sizeBytes ?? null,
      chars,
      // Vision makes an unreadable document readable: the step really can work
      // from it, and a rule testing `readable == false` to mean "I cannot use
      // this" would be wrong to still fire.
      readable: hasText || !!vision,
      truncated,
      ...(charsShown < chars ? { charsShown } : {}),
      ...(pages ? { pages } : {}),
      ...(vision ? { readBy: "vision" as const, pagesShown: vision.shown } : hasText ? { readBy: "text" as const } : {}),
      ...(vision
        ? { note: visionNote(vision) }
        : !hasText
        ? { note: UNREADABLE_NOTE }
        : stepCut
          ? {
            note: `Only the first ${charsShown.toLocaleString("en-US")} of ${chars.toLocaleString("en-US")} characters are given to this step` +
              `${extractorCut ? ", and the reader had already stopped short of the end of the file" : ""}. ` +
              `Anything later in the document was not shown: do not conclude it is absent.`,
          }
          : extractorCut
            ? { note: coverage?.omitted ?? "Only part of this file could be read; what the steps are given is incomplete." }
            : {}),
    });
  }

  return { documents, missing };
}

/**
 * The descriptors sitting in a run's state, narrowed to what one node may see.
 * Reads the schema rather than sniffing the value's shape, so a step that
 * happens to write an object with a `fileId` is not mistaken for a document
 * the run was given.
 *
 * `scope` is visibleStateKeys' return value, and the rule here MUST be the one
 * buildAgentInput applies to the state dump: a key is hidden only when some
 * node OWNS it and this node cannot see it. An input field is owned by no node
 * -- it is given to the run, not written by a step -- so it is visible
 * everywhere, exactly as `request` is.
 *
 * Testing `scope.visible` alone was wrong and shipped that way: `visible` holds
 * only node stateKeys, so a `file` input never appeared in it, and the document
 * text reached no step at all. The descriptor still reached the prompt (the
 * state dump shows unowned keys), which is what made it look like it worked --
 * a step could name the file and say it was readable while never seeing a word
 * of it. Proved on run ab3b1d4b against the deployed app: an echo step asked to
 * repeat its headings returned "## STATE: sov_document" and no document block.
 */
export function runDocumentsInState(
  stateSchema: Record<string, StateFieldDef> | null | undefined,
  state: Record<string, unknown>,
  scope?: { visible: Set<string>; owned: Set<string> },
): Array<{ field: string; document: RunDocument }> {
  const out: Array<{ field: string; document: RunDocument }> = [];
  for (const field of fileInputFieldNames(stateSchema)) {
    if (scope && scope.owned.has(field) && !scope.visible.has(field)) continue;
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
): Promise<RunDocumentContext> {
  if (!documents.length) return { text: "", imageFileIds: [] };

  // Three kinds, and they cannot share a path: text goes in the prompt, a scan
  // goes in as images, and an unreadable file goes in as a statement that it
  // could not be read. Putting a scan through the text path would inline its
  // empty extraction and tell the step the document was blank.
  const scanned = documents.filter((d) => d.readBy === "vision");
  const readable = documents.filter((d) => d.readable && d.readBy !== "vision");
  const unreadable = documents.filter((d) => !d.readable);

  const sections: string[] = [];
  const imageFileIds: string[] = [];

  if (readable.length) {
    // What each document is, before its contents: a step that knows a schedule
    // runs to 18 pages and that it was given 6 of them can qualify its answer.
    // The same step given only the text cannot tell a short document from a
    // truncated one.
    const inventory = readable.map((d) => {
      const extent = [
        d.pages ? `${d.pages} page${d.pages === 1 ? "" : "s"}` : null,
        // What arrived, against what exists. "120,000 of 359,214 characters"
        // is a fact a step can act on; "359,214 characters read" beside a
        // prompt holding a third of that is the contradiction this fixes.
        d.charsShown !== undefined
          ? `${d.charsShown.toLocaleString("en-US")} of ${d.chars.toLocaleString("en-US")} characters shown`
          : `${d.chars.toLocaleString("en-US")} characters read`,
        d.truncated ? "PARTIAL" : null,
      ].filter(Boolean).join(", ");
      return `- ${d.filename} (${extent})${d.truncated && d.note ? `: ${d.note}` : ""}`;
    });

    const { context } = await buildAttachmentContext(
      readable.map((d) => d.fileId),
      orgId,
      [
        "This run was given the following document(s). Their contents are reproduced below.",
        ...inventory,
        "",
        "Work from them. Where a document is marked PARTIAL, say so in your output rather than treating what you were given as the whole document.",
      ],
      RUN_DOCUMENT_PREVIEW_CHARS,
    );
    if (context) sections.push(context);
  }

  // A scan: its pages ride as image blocks, so the prompt's job is to say
  // which attached images are which document. Without that a step holding
  // three scans and 30 images cannot tell them apart.
  if (scanned.length) {
    const rows = await readAttachedFiles(scanned.map((d) => d.fileId), orgId);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines: string[] = [];
    for (const d of scanned) {
      const row = byId.get(d.fileId);
      // The render is cached on the file's bytes, so this is the same work
      // resolveRunDocuments already did at setup: a cache hit, not a re-render.
      const v = await visionPagesFor((row as { content?: Buffer | null } | undefined)?.content ?? null, d.filename);
      if (!v) continue;
      imageFileIds.push(...v.fileIds);
      lines.push(`- ${d.filename}: ${visionNote(v)}`);
    }
    if (lines.length) {
      sections.push([
        scanned.length === documents.length
          ? "This run was given the following document(s) as images, because they have no text layer. The pages are attached to this message in order."
          : "The run was also given the following document(s) as images, because they have no text layer. The pages are attached to this message in order.",
        ...lines,
        "",
        "Read them from the attached page images. Anything you cannot make out, say so rather than guessing at it.",
      ].join("\n"));
    }
  }

  if (unreadable.length) {
    sections.push(
      [
        readable.length || scanned.length
          ? "The run was also given the following document(s), which could NOT be read:"
          : "This run was given the following document(s), which could NOT be read:",
        ...unreadable.map((d) => `- ${d.filename}${d.kind ? ` (${d.kind})` : ""}: ${d.note ?? UNREADABLE_NOTE}`),
        "",
        "Do not infer their contents. If your step needs what is in them, say that it could not be read and stop there.",
      ].join("\n"),
    );
  }

  return { text: sections.join("\n\n"), imageFileIds };
}
