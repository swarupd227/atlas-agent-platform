/**
 * Shared document text extraction.
 *
 * Every upload surface (Knowledge Base, Agent Workspace attachments, the Agent
 * Wizard, Process Flow authoring, Eval Studio) funnels through here, so a file
 * type supported in one place is supported everywhere and behaves identically.
 *
 * Deliberately dependency-free beyond what the repo already carries: pdf-parse
 * and mammoth were already used by kb-routes, and OOXML formats (xlsx/pptx) are
 * just zip archives of XML, which jszip + cheerio (both existing direct deps)
 * handle without adding a spreadsheet library.
 *
 * Scope note: extraction here is for CONTEXT -- putting a readable rendering of
 * a document in front of a model, and chunking it for retrieval. It is not a
 * substitute for real computation over a spreadsheet. For that, the file goes
 * to the Anthropic code-execution container, where pandas/openpyxl read the
 * workbook natively (formulas, types, multiple sheets) instead of reading a
 * flattened transcription of it.
 */

import { Readable } from "stream";
import { StringDecoder } from "string_decoder";
import { knowledgeLimits } from "./config";

export type ExtractedKind = "text" | "csv" | "json" | "pdf" | "docx" | "xlsx" | "pptx" | "image" | "video";

/** One non-empty data row from a workbook or CSV, ready to index on its own.
 *  The header is repeated on the record so a cell keeps its column name
 *  without depending on a neighbour row that may land in a different chunk. */
export interface SpreadsheetRecord {
  text: string;
  sheet: string;
  /** Value of the row's identifier column (see spreadsheetKeyColumn), or the
   *  first column when no header names one. Kept under this name because
   *  stored chunk metadata and the exact-match lookup already use it. */
  productId: string;
  /** 1-based worksheet row number when the file has one. */
  rowNumber: number;
}

/** Where a section sits in its source document, carried onto every chunk cut
 *  from it so a passage can be cited and a late page or row can be asked for. */
export interface SectionLocator {
  page?: number;
  slide?: number;
  sheet?: string;
  rowNumber?: number;
  heading?: string;
  lineStart?: number;
  lineEnd?: number;
  /** The row's identifier value, for exact lookup. */
  key?: string;
}

/** A self-contained piece of a document: one PDF page, one slide, one
 *  spreadsheet/CSV row, one heading's worth of a Word document, or a run of
 *  lines of plain text. Sections are never cut mid-way by the extractor. */
export interface DocumentSection {
  text: string;
  locator: SectionLocator;
}

export type CoverageUnit = "page" | "slide" | "row" | "section";

/** How much of the document the extractor kept, in the document's own units. */
export interface ExtractionCoverage {
  unit: CoverageUnit;
  unitsTotal: number;
  unitsKept: number;
  charsKept: number;
  complete: boolean;
  /** Plain statement of what was left out. Absent when complete. */
  omitted?: string;
}

export interface ExtractedFile {
  text: string;
  kind: ExtractedKind;
  /** Set for workbooks and CSV/TSV: one record per data row. */
  records?: SpreadsheetRecord[];
  /** The document in located pieces, in reading order. Knowledge-base
   *  indexing and large-attachment selection work from these rather than
   *  from `text`. Absent for images and video. */
  sections?: DocumentSection[];
  /** Per-format detail worth surfacing in the UI ("3 sheets", "12 slides"). */
  meta: {
    sheets?: string[];
    slides?: number;
    pages?: number;
    truncated?: boolean;
    /** Data rows omitted because the workbook hit the safety ceiling. */
    rowsDropped?: number;
    coverage?: ExtractionCoverage;
    /** Set when a format was read but genuinely contained no text. */
    empty?: boolean;
    /**
     * A PDF whose pages carry no text at all -- a scan, or a page exported as
     * an image. `empty` says there was nothing to read; this says the reason
     * is that the text is in the pixels, so rendering the pages and showing
     * them to a model can still recover the content. An empty .txt has no
     * such second chance, which is why this is not simply `empty` restated.
     */
    needsVision?: boolean;
    /** Image/video pixel dimensions, when the header could be read. */
    width?: number;
    height?: number;
    /** Video duration, when the mp4 header could be read. */
    durationSeconds?: number;
  };
}

/** Thrown for a file type we cannot read. Callers should surface this to the
 *  user rather than storing whatever bytes happened to arrive. */
export class UnsupportedFileTypeError extends Error {
  readonly filename: string;
  constructor(filename: string) {
    super(
      `Cannot read '${filename}'. Supported types: PDF, Word (.docx), Excel (.xlsx), ` +
      `PowerPoint (.pptx), CSV, JSON, and plain text (.txt/.md).`,
    );
    this.name = "UnsupportedFileTypeError";
    this.filename = filename;
  }
}

/**
 * Safety ceiling on the text kept from one document, applied to whole
 * sections (pages, slides, headings, line runs) in reading order -- never as
 * a prefix cut through the middle of one. It bounds memory, storage and
 * embedding cost for a pathological file; ordinary documents under the
 * upload limits never reach it. Past it the extract says exactly which
 * sections were left out.
 */
export const MAX_DOCUMENT_CHARS = 20_000_000;

/** Target size of one plain-text section. Sections, not this, decide where a
 *  document may be cut; the size only keeps each one small enough to show or
 *  skip on its own. */
const TEXT_SECTION_CHARS = 4_000;

/** Safety ceiling for one workbook or CSV. Whole data rows are kept or
 *  dropped — never a prefix of the joined sheet. Past either limit the
 *  extract is marked truncated so a partial file is not presented as the
 *  full table. */
export const MAX_XLSX_DATA_ROWS = 100_000;
export const MAX_XLSX_RECORD_CHARS = 12_000_000;

/** True when another data row must not be stored. The first row is always
 *  kept intact, even if it alone is larger than the character ceiling. */
export function spreadsheetRowExceedsCeiling(keptRows: number, keptChars: number, nextChars: number): boolean {
  if (keptRows >= MAX_XLSX_DATA_ROWS) return true;
  if (keptRows > 0 && keptChars + nextChars > MAX_XLSX_RECORD_CHARS) return true;
  return false;
}

const EXT = (filename: string) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(filename.trim());
  return m ? m[1].toLowerCase() : "";
};

/**
 * Legacy Office formats are a common and confusing failure: .xls/.ppt/.doc are
 * OLE compound files, NOT zip+XML, so the OOXML readers below produce nothing.
 * Naming them explicitly beats a generic "unsupported" message, because the fix
 * (re-save as .xlsx) is not obvious otherwise.
 */
const LEGACY_OFFICE = new Set(["xls", "ppt", "doc"]);

/** One line, no control characters, short enough for a log field or a model result. */
export function filenameForLog(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned || "(unnamed)";
}

/** An Office archive that would expand past the configured entry or byte ceilings. */
export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipLimitError";
  }
}

export interface OfficeZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxExpandedBytes: number;
}

export function officeZipLimits(over?: Partial<OfficeZipLimits>): OfficeZipLimits {
  return {
    maxEntries: over?.maxEntries ?? knowledgeLimits.zipMaxEntries,
    maxEntryBytes: over?.maxEntryBytes ?? knowledgeLimits.zipMaxEntryBytes,
    maxExpandedBytes: over?.maxExpandedBytes ?? knowledgeLimits.zipMaxExpandedBytes,
  };
}

export class LegacyOfficeFormatError extends Error {
  constructor(filename: string, ext: string) {
    super(
      `'${filename}' is the legacy .${ext} format, which cannot be read directly. ` +
      `Open it and re-save as .${ext}x (for example .${ext}x instead of .${ext}), then upload again.`,
    );
    this.name = "LegacyOfficeFormatError";
  }
}

const SUPPORTED_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "log",
  "pdf", "docx", "xlsx", "xlsm", "pptx",
]);

export function isSupportedFile(filename: string): boolean {
  return SUPPORTED_EXTS.has(EXT(filename));
}

/**
 * Deliberately NOT part of SUPPORTED_EXTS: images have no extractable text, so
 * they are only meaningful on surfaces that retain the bytes and can hand them
 * to the code-execution container (chat attachments). Knowledge Base ingestion
 * chunks and embeds extracted text, and must keep refusing them.
 *
 * SVG (needs rasterizing) and HEIC (needs conversion) are excluded until the
 * platform has an image-preprocessing step; accepting them now would produce
 * files python-pptx cannot place.
 */
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTS.has(EXT(filename));
}

/**
 * mp4 only, deliberately: it is the one container PowerPoint plays reliably
 * across platforms (H.264/AAC), python-pptx's add_movie expects it, and
 * accepting .mov/.avi/.webm would produce decks whose videos silently fail on
 * the client's machine. Transcoding other formats is blob-storage-era work.
 * The 25 MB upload ceiling applies — a short promo clip fits; long-form video
 * waits for object storage.
 */
const VIDEO_EXTS = new Set(["mp4"]);

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTS.has(EXT(filename));
}

/** Client-side `accept` string, kept next to the reader so the two cannot drift. */
export const UPLOAD_ACCEPT_ATTR =
  ".pdf,.docx,.xlsx,.xlsm,.pptx,.csv,.tsv,.txt,.md,.json,.png,.jpg,.jpeg,.gif,.webp,.mp4";

export const SUPPORTED_TYPES_LABEL =
  "PDF, Word, Excel, PowerPoint, CSV, JSON, text, images (PNG, JPG, GIF, WebP), or MP4 video";

function describeLocator(loc: SectionLocator | undefined): string {
  if (!loc) return "the rest of the document";
  if (loc.page) return `page ${loc.page}`;
  if (loc.slide) return `slide ${loc.slide}`;
  if (loc.rowNumber) return `${loc.sheet ? `sheet ${loc.sheet} ` : ""}row ${loc.rowNumber}`;
  if (loc.lineStart) return `line ${loc.lineStart}`;
  if (loc.heading) return `the section "${loc.heading}"`;
  return "the rest of the document";
}

/** Whole sections in order while they fit MAX_DOCUMENT_CHARS. The first is
 *  always kept, so a document is never reduced to nothing. */
export function keepSections(
  sections: DocumentSection[],
  unit: CoverageUnit,
  maxChars: number = MAX_DOCUMENT_CHARS,
): { kept: DocumentSection[]; coverage: ExtractionCoverage } {
  const kept: DocumentSection[] = [];
  let chars = 0;
  for (const section of sections) {
    if (kept.length > 0 && chars + section.text.length > maxChars) break;
    kept.push(section);
    chars += section.text.length;
  }
  const complete = kept.length === sections.length;
  const plural = (n: number) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return {
    kept,
    coverage: {
      unit,
      unitsTotal: sections.length,
      unitsKept: kept.length,
      charsKept: chars,
      complete,
      ...(complete ? {} : {
        omitted: `${plural(sections.length - kept.length)} of ${sections.length}, from ${describeLocator(sections[kept.length]?.locator)} on, ` +
          `were not read: the document is larger than the ${MAX_DOCUMENT_CHARS.toLocaleString("en-US")}-character safety limit.`,
      }),
    },
  };
}

function truncationNotice(coverage: ExtractionCoverage): string {
  return coverage.complete ? "" : `\n\n[truncated: ${coverage.omitted} This is not the full document.]`;
}

/**
 * Plain text in sections of roughly TEXT_SECTION_CHARS, broken at blank lines
 * (paragraphs) and at markdown headings, with the line range of each. A
 * section only breaks mid-paragraph when a paragraph alone is far over size.
 */
export function splitTextSections(text: string, targetChars: number = TEXT_SECTION_CHARS): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let bufChars = 0;
  let start = 1;
  let heading: string | undefined;
  const flush = (endLine: number) => {
    const body = buf.join("\n");
    if (body.trim()) {
      sections.push({ text: body, locator: { lineStart: start, lineEnd: endLine, ...(heading ? { heading } : {}) } });
    }
    buf = [];
    bufChars = 0;
    start = endLine + 1;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (h && bufChars > 0) flush(lineNo - 1);
    if (h) heading = h[1].trim();
    if (bufChars === 0) start = lineNo;
    buf.push(line);
    bufChars += line.length + 1;
    const atParagraphEnd = line.trim() === "";
    if ((atParagraphEnd && bufChars >= targetChars) || bufChars >= targetChars * 2) flush(lineNo);
  }
  if (buf.length) flush(lines.length);
  return sections;
}

function textResult(
  raw: string,
  kind: ExtractedKind,
  extraMeta: ExtractedFile["meta"] = {},
): ExtractedFile {
  const { kept, coverage } = keepSections(splitTextSections(raw), "section");
  const text = coverage.complete ? raw : kept.map((s) => s.text).join("\n") + truncationNotice(coverage);
  return {
    text,
    kind,
    sections: kept,
    meta: { ...extraMeta, truncated: !coverage.complete, coverage, ...(raw.trim() ? {} : { empty: true }) },
  };
}

/**
 * A buffer is treated as binary if it carries NUL bytes in its head. Used to
 * refuse mystery files rather than storing mojibake: the previous behaviour
 * (`buffer.toString("utf-8")` for anything unrecognised) silently ingested zip
 * binary as "text", chunked it, and embedded it into retrieval.
 */
function looksBinary(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 8_000);
  return head.includes(0);
}

/**
 * Best-effort header sniff, dependency-free like the rest of this file. The
 * dimensions feed the attachment stub so the model can reason about aspect
 * ratio ("1920×640 is a banner, not a headshot") without seeing the pixels.
 * Returns undefined rather than guessing when a header is unfamiliar — the
 * stub is still useful without them. WebP is deliberately unparsed: its three
 * container variants (VP8/VP8L/VP8X) are not worth hand-rolling for a hint.
 */
function imageDimensions(buffer: Buffer, ext: string): { width: number; height: number } | undefined {
  try {
    if (ext === "png" && buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (ext === "gif" && buffer.length >= 10) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if ((ext === "jpg" || ext === "jpeg") && buffer.length >= 4 && buffer.readUInt16BE(0) === 0xffd8) {
      let off = 2;
      while (off + 9 < buffer.length) {
        if (buffer[off] !== 0xff) { off++; continue; }
        const marker = buffer[off + 1];
        // SOF0..SOF15 excluding DHT(C4)/JPG(C8)/DAC(CC) — the frame headers
        // that actually carry the image dimensions.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(off + 5), width: buffer.readUInt16BE(off + 7) };
        }
        const len = buffer.readUInt16BE(off + 2);
        if (len < 2) break;
        off += 2 + len;
      }
    }
  } catch { /* dimensions are a nicety, not a requirement */ }
  return undefined;
}

/**
 * Best-effort mp4 header sniff, same spirit as imageDimensions(): duration and
 * frame size feed the attachment stub ("12s, 1280×720") so the model can
 * reason about a video it cannot watch. A linear scan for the mvhd/tkhd
 * FourCCs with fixed offsets covers ordinary encoder output; anything odd
 * just yields no hint.
 */
function mp4Info(buffer: Buffer): { durationSeconds?: number; width?: number; height?: number } {
  const out: { durationSeconds?: number; width?: number; height?: number } = {};
  try {
    const mvhd = buffer.indexOf("mvhd");
    if (mvhd !== -1) {
      const version = buffer[mvhd + 4];
      if (version === 0 && mvhd + 24 <= buffer.length) {
        const timescale = buffer.readUInt32BE(mvhd + 16);
        const duration = buffer.readUInt32BE(mvhd + 20);
        if (timescale > 0) out.durationSeconds = Math.round(duration / timescale);
      } else if (version === 1 && mvhd + 36 <= buffer.length) {
        const timescale = buffer.readUInt32BE(mvhd + 24);
        const duration = Number(buffer.readBigUInt64BE(mvhd + 28));
        if (timescale > 0) out.durationSeconds = Math.round(duration / timescale);
      }
    }
    const tkhd = buffer.indexOf("tkhd");
    if (tkhd !== -1) {
      const version = buffer[tkhd + 4];
      // Width/height are 16.16 fixed-point at the end of the box: after
      // version+flags come the times/ids (20 bytes in v0, 32 in v1), then
      // 16 reserved/layer/volume bytes and a 36-byte matrix.
      const off = tkhd + 4 + (version === 1 ? 84 : 76);
      if (off + 8 <= buffer.length) {
        const w = buffer.readUInt32BE(off) >>> 16;
        const h = buffer.readUInt32BE(off + 4) >>> 16;
        if (w > 0 && w < 10_000 && h > 0 && h < 10_000) { out.width = w; out.height = h; }
      }
    }
  } catch { /* hints only */ }
  return out;
}

/** Local tag name, ignoring any XML namespace prefix (`a:t` -> `t`). */
function localName(tagName: string): string {
  const i = tagName.indexOf(":");
  return (i === -1 ? tagName : tagName.slice(i + 1)).toLowerCase();
}

/** Bytes inflated so far for one archive, shared across its entries. */
class ZipInflation {
  inflated = 0;
  constructor(readonly limits: OfficeZipLimits) {}

  /** Count one chunk. Stops at the first entry or archive that crosses a ceiling. */
  note(chunkBytes: number, entryBytes: number): void {
    if (entryBytes > this.limits.maxEntryBytes) {
      throw new ZipLimitError(`An entry in this Office file is larger than the ${this.limits.maxEntryBytes} byte limit.`);
    }
    this.inflated += chunkBytes;
    if (this.inflated > this.limits.maxExpandedBytes) {
      throw new ZipLimitError(`This Office file expands past the ${this.limits.maxExpandedBytes} byte limit.`);
    }
  }
}

function eocdEntryCount(buffer: Buffer): number {
  const min = 22;
  if (buffer.length < min) throw new ZipLimitError("This file is not a readable Office archive.");
  const max = Math.min(buffer.length, min + 0xffff);
  for (let i = buffer.length - min; i >= buffer.length - max; i--) {
    if (buffer.readUInt32LE(i) !== 0x06054b50) continue;
    const commentLen = buffer.readUInt16LE(i + 20);
    if (i + min + commentLen !== buffer.length) continue;
    return buffer.readUInt16LE(i + 10);
  }
  throw new ZipLimitError("This file is not a readable Office archive.");
}

function tooManyEntries(count: number, limits: OfficeZipLimits): ZipLimitError {
  const shown = count === 0xffff ? "65535 or more" : String(count);
  return new ZipLimitError(`This Office file has too many archive entries (${shown}; limit ${limits.maxEntries}).`);
}

/** Stream one entry, counting inflated bytes and discarding them. */
async function countInflated(entry: any, budget: ZipInflation): Promise<void> {
  const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
  let entryBytes = 0;
  let limited: ZipLimitError | null = null;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      entryBytes += chunk.length;
      try {
        budget.note(chunk.length, entryBytes);
      } catch (err) {
        if (err instanceof ZipLimitError) limited = err;
        stream.destroy();
        break;
      }
    }
  } catch (err) {
    stream.destroy();
    if (limited) throw limited;
    throw err;
  }
  if (limited) throw limited;
}

/**
 * Open a DOCX, XLSX or PPTX only when its central directory and its inflated
 * bytes stay inside the ceilings. The inflated bytes are counted and dropped
 * here; callers read the entries again, still counting, so a limit stops the
 * read that crosses it.
 */
async function openOfficeZip(buffer: Buffer, limits: OfficeZipLimits): Promise<any> {
  const declaredCount = eocdEntryCount(buffer);
  if (declaredCount === 0xffff || declaredCount > limits.maxEntries) throw tooManyEntries(declaredCount, limits);

  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry: any) => !entry.dir);
  if (entries.length > limits.maxEntries) throw tooManyEntries(entries.length, limits);

  let declared = 0;
  for (const entry of entries as any[]) {
    const size = typeof entry._data?.uncompressedSize === "number" ? entry._data.uncompressedSize : 0;
    if (size > limits.maxEntryBytes) {
      throw new ZipLimitError(`An entry in this Office file is larger than the ${limits.maxEntryBytes} byte limit.`);
    }
    declared += size;
    if (declared > limits.maxExpandedBytes) {
      throw new ZipLimitError(`This Office file expands past the ${limits.maxExpandedBytes} byte limit.`);
    }
  }

  const budget = new ZipInflation(limits);
  for (const entry of entries) await countInflated(entry, budget);
  return zip;
}

async function readEntryText(entry: any, budget: ZipInflation): Promise<string> {
  const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
  const chunks: Buffer[] = [];
  let entryBytes = 0;
  let limited: ZipLimitError | null = null;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      entryBytes += chunk.length;
      try {
        budget.note(chunk.length, entryBytes);
      } catch (err) {
        if (err instanceof ZipLimitError) limited = err;
        stream.destroy();
        break;
      }
      chunks.push(chunk);
    }
  } catch (err) {
    stream.destroy();
    if (limited) throw limited;
    throw err;
  }
  if (limited) throw limited;
  return Buffer.concat(chunks).toString("utf8");
}

async function loadXml(zip: any, path: string, budget: ZipInflation): Promise<any | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  const cheerio = await import("cheerio");
  return cheerio.load(await readEntryText(entry, budget), { xmlMode: true });
}

/** Text of every <t> descendant, in document order. Shared by xlsx and pptx,
 *  both of which store runs as a sequence of <t> nodes under a parent. */
function textNodesUnder($: any, root: any): string[] {
  const out: string[] = [];
  $(root).find("*").each((_i: number, el: any) => {
    if (el.tagName && localName(el.tagName) === "t") out.push($(el).text());
  });
  return out;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
/** One section per page, numbered as the PDF numbers them. `text` is the
 *  parser's own rendering, which marks each page boundary. */
async function extractPdf(buffer: Buffer): Promise<{ text: string; pages: DocumentSection[]; total: number }> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const pages = (result.pages ?? []).map((p: { num: number; text: string }) => ({ text: p.text ?? "", locator: { page: p.num } }));
    return { text: result.text, pages, total: result.total ?? pages.length };
  } finally {
    await parser.destroy();
  }
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
/** Past this a heading's section continues in a new section under the same
 *  heading, so one long chapter can still be shown or skipped in parts. */
const DOCX_SECTION_CHARS = 8_000;

/** Embedded pictures, fonts and OLE objects are not the document's text. Mammoth
 *  would inflate them again with no size check, so they are left out of the
 *  copy it is given. */
function isDocxTextPart(name: string): boolean {
  const n = name.replace(/\\/g, "/").toLowerCase();
  if (n.endsWith("/")) return false;
  return !n.startsWith("word/media/") && !n.startsWith("word/embeddings/") && !n.startsWith("word/fonts/");
}

/**
 * A DOCX containing only the parts already inflated under the ceiling, stored
 * so Mammoth's own unzip is a copy of those parts and cannot grow past the
 * ceiling that counted them.
 */
async function docxWithinLimits(zip: any, limits: OfficeZipLimits): Promise<Buffer> {
  const JSZip = (await import("jszip")).default;
  const out = new JSZip();
  const budget = new ZipInflation(limits);
  for (const name of Object.keys(zip.files)) {
    const entry = zip.file(name);
    if (!entry || entry.dir || !isDocxTextPart(name)) continue;
    out.file(name, await readEntryText(entry, budget));
  }
  return out.generateAsync({ type: "nodebuffer", compression: "STORE" });
}

function assertWithinExpandedLimit(text: string, limits: OfficeZipLimits): void {
  if (Buffer.byteLength(text) > limits.maxExpandedBytes) {
    throw new ZipLimitError(`This Office file expands past the ${limits.maxExpandedBytes} byte limit.`);
  }
}

/**
 * Word documents in reading order, one section per heading. Tables carry most
 * of the meaning in the documents users actually upload (rate cards,
 * matrices), so each becomes a markdown table instead of an unreadable run of
 * cell values; headings and paragraphs keep their own lines.
 */
async function extractDocx(buffer: Buffer, limits: OfficeZipLimits): Promise<{ text: string; sections: DocumentSection[] }> {
  const zip = await openOfficeZip(buffer, limits);
  const bounded = await docxWithinLimits(zip, limits);
  const mammoth = await import("mammoth");
  const html = (await mammoth.convertToHtml({ buffer: bounded })).value ?? "";
  assertWithinExpandedLimit(html, limits);
  if (!html.trim()) {
    const raw = (await mammoth.extractRawText({ buffer: bounded })).value ?? "";
    assertWithinExpandedLimit(raw, limits);
    return { text: raw, sections: splitTextSections(raw) };
  }
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  $("br").replaceWith("\n");

  const sections: DocumentSection[] = [];
  let heading: string | undefined;
  let blocks: string[] = [];
  let chars = 0;
  const flush = () => {
    const body = blocks.join("\n\n").trim();
    if (body) sections.push({ text: body, locator: heading ? { heading } : {} });
    blocks = [];
    chars = 0;
  };
  const push = (block: string) => {
    if (!block.trim()) return;
    if (chars > 0 && chars + block.length > DOCX_SECTION_CHARS) flush();
    blocks.push(block);
    chars += block.length + 2;
  };

  $("body").children().each((_i: number, el: any) => {
    const tag = String(el.tagName ?? "").toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      flush();
      heading = $(el).text().replace(/\s+/g, " ").trim() || heading;
      push($(el).text().trim());
      return;
    }
    if (tag === "table") {
      const rows: string[][] = [];
      $(el).find("tr").each((_j: number, tr: any) => {
        const cells: string[] = [];
        $(tr).find("th, td").each((_k: number, cell: any) => {
          cells.push($(cell).text().replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
        });
        if (cells.length) rows.push(cells);
      });
      if (rows.length) push(toMarkdownTable(rows));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items: string[] = [];
      $(el).children("li").each((_j: number, li: any) => { items.push(`- ${$(li).text().trim()}`); });
      push(items.join("\n"));
      return;
    }
    push($(el).text().trim());
  });
  flush();

  return { text: sections.map((s) => s.text).join("\n\n"), sections };
}

function toMarkdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  // A reduce, not Math.max(...rows): spreading a 100k-row sheet as arguments overflows the stack.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const [header, ...body] = rows;
  return [
    `| ${pad(header).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...body.map((r) => `| ${pad(r).join(" | ")} |`),
  ].join("\n");
}

// ── XLSX ─────────────────────────────────────────────────────────────────────
/** Column reference ("BC12") -> zero-based column index, so gaps in a sparse
 *  row line up instead of shifting every later cell left. */
function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Headers that are an identifier on their own, compared after stripping
 *  spaces, punctuation and case. */
const IDENTIFIER_HEADERS = new Set(["id", "key", "code", "sku", "ref", "reference", "uuid", "guid"]);

/** Headers that end in an identifier word: `Product ID`, `item_code`,
 *  `Part No`, `Invoice Number`, `Account Ref`. */
const IDENTIFIER_SUFFIX = /(id|code|sku|number|num|no|nr|ref|key)$/;

function isIdentifierHeader(header: string): boolean {
  const k = headerKey(header);
  if (!k) return false;
  return IDENTIFIER_HEADERS.has(k) || (k.length <= 24 && IDENTIFIER_SUFFIX.test(k));
}

/** Column that identifies a row: the first header that names an identifier,
 *  or the first column when none does. */
export function spreadsheetKeyColumn(headers: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (isIdentifierHeader(headers[i] ?? "")) return i;
  }
  return 0;
}

/** Earlier name of spreadsheetKeyColumn, kept for existing callers. */
export const spreadsheetProductColumn = spreadsheetKeyColumn;

/** One data row with its header repeated, so the product id and every other
 *  cell stay in the same searchable record. */
export function formatSpreadsheetRecord(sheet: string, headers: string[], cells: string[]): string {
  const width = Math.max(headers.length, cells.length);
  const lines = [`Sheet: ${sheet}`];
  for (let i = 0; i < width; i++) {
    const named = (headers[i] ?? "").trim();
    const header = named || `Column ${i + 1}`;
    const value = (cells[i] ?? "").trim();
    if (!value && !named) continue;
    lines.push(`${header}: ${value}`);
  }
  return lines.join("\n");
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e[0] !== "#") return XML_ENTITIES[e];
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

function xmlAttrs(attrs: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs))) out[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

/** Concatenated text of the <t> runs in a fragment, leaving out phonetic
 *  guides (<rPh>), which are a reading aid and not the cell's value. */
function runText(xml: string): string {
  const body = xml.includes("rPh") ? xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "") : xml;
  let out = "";
  const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out += decodeXml(m[1]);
  return out;
}

/**
 * Elements matching `re` from a zip entry, decoded incrementally. A worksheet
 * or shared-string table can decompress to hundreds of megabytes, so it is
 * never held as one string or one DOM: complete elements are taken from the
 * front of a rolling buffer as the stream arrives.
 */
async function* streamElements(entry: any, re: RegExp, budget: ZipInflation): AsyncGenerator<RegExpExecArray> {
  const decoder = new StringDecoder("utf8");
  let buf = "";
  let entryBytes = 0;
  const drain = function* (): Generator<RegExpExecArray> {
    re.lastIndex = 0;
    let consumed = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(buf))) {
      consumed = re.lastIndex;
      yield m;
    }
    if (consumed) buf = buf.slice(consumed);
  };
  // JSZip hands back an old-style stream; wrap() makes it async-iterable.
  const stream = new Readable().wrap(entry.nodeStream("nodebuffer"));
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      entryBytes += chunk.length;
      budget.note(chunk.length, entryBytes);
      buf += decoder.write(chunk);
      yield* drain();
    }
  } catch (err) {
    stream.destroy();
    throw err;
  }
  buf += decoder.end();
  yield* drain();
}

const ROW_RE = () => /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
const CELL_RE = () => /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
const SI_RE = () => /<(?:\w+:)?si\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?si>)/g;
const V_RE = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/;

async function extractXlsx(buffer: Buffer, limits: OfficeZipLimits): Promise<{ text: string; sheets: string[]; records: SpreadsheetRecord[]; truncated: boolean; rowsDropped: number }> {
  const zip = await openOfficeZip(buffer, limits);
  const budget = new ZipInflation(limits);

  // Shared strings are stored once and referenced by index from every cell.
  const shared: string[] = [];
  const ssEntry = zip.file("xl/sharedStrings.xml");
  if (ssEntry) {
    for await (const m of streamElements(ssEntry, SI_RE(), budget)) shared.push(runText(m[1] ?? ""));
  }

  // Sheet display names live in workbook.xml; the file each maps to comes from
  // the rels file. Without the mapping, sheet order and names can disagree.
  const wbEntry = zip.file("xl/workbook.xml");
  const relsEntry = zip.file("xl/_rels/workbook.xml.rels");
  const wbXml = wbEntry ? await readEntryText(wbEntry, budget) : "";
  const relsXml = relsEntry ? await readEntryText(relsEntry, budget) : "";
  const relTarget = new Map<string, string>();
  for (const m of Array.from(relsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/g))) {
    const a = xmlAttrs(m[1]);
    if (a.Id && a.Target) relTarget.set(a.Id, a.Target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets: Array<{ name: string; path: string }> = [];
  for (const m of Array.from(wbXml.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g))) {
    const a = xmlAttrs(m[1]);
    const name = a.name ?? `Sheet${sheets.length + 1}`;
    const ridKey = Object.keys(a).find((k) => k === "id" || k.endsWith(":id"));
    const target = ridKey ? relTarget.get(a[ridKey]) : undefined;
    sheets.push({ name, path: `xl/${target ?? `worksheets/sheet${sheets.length + 1}.xml`}` });
  }
  if (!sheets.length) sheets.push({ name: "Sheet1", path: "xl/worksheets/sheet1.xml" });

  const parts: string[] = [];
  const names: string[] = [];
  const records: SpreadsheetRecord[] = [];
  /** Whole data rows left out by the safety ceiling. A prefix of the joined
   *  sheet is never a substitute for them. */
  let rowsDropped = 0;
  let keptRows = 0;
  let keptChars = 0;
  let dropping = false;

  for (const sheet of sheets) {
    const entry = zip.file(sheet.path);
    if (!entry) continue;
    names.push(sheet.name);

    const rows: string[][] = [];
    let header: string[] | null = null;
    let keyCol = 0;
    let ordinal = 0;
    for await (const rowMatch of streamElements(entry, ROW_RE(), budget)) {
      ordinal++;
      const cells: string[] = [];
      const cellRe = CELL_RE();
      let c: RegExpExecArray | null;
      while ((c = cellRe.exec(rowMatch[2] ?? ""))) {
        const a = xmlAttrs(c[1]);
        const body = c[2] ?? "";
        let value = "";
        if (a.t === "s") {
          // Shared-string cell: <v> holds an index into sharedStrings.
          const idx = parseInt(V_RE.exec(body)?.[1] ?? "", 10);
          value = Number.isFinite(idx) ? (shared[idx] ?? "") : "";
        } else if (a.t === "inlineStr") {
          value = runText(body);
        } else {
          value = decodeXml(V_RE.exec(body)?.[1] ?? "");
        }
        const at = colIndex(a.r ?? "A");
        while (cells.length < at) cells.push("");
        cells.push(value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
      }
      if (!cells.some((v) => v !== "")) continue;

      // The first non-empty row of the sheet is the header, not a data row.
      if (!header) {
        header = cells;
        keyCol = spreadsheetKeyColumn(header);
        rows.push(cells);
        continue;
      }

      if (dropping || spreadsheetRowExceedsCeiling(keptRows, keptChars, 0)) {
        dropping = true;
        rowsDropped++;
        continue;
      }
      const text = formatSpreadsheetRecord(sheet.name, header, cells);
      if (spreadsheetRowExceedsCeiling(keptRows, keptChars, text.length)) {
        dropping = true;
        rowsDropped++;
        continue;
      }
      const rowAttr = parseInt(xmlAttrs(rowMatch[1]).r ?? "", 10);
      records.push({
        text,
        sheet: sheet.name,
        productId: (cells[keyCol] ?? "").trim(),
        rowNumber: Number.isFinite(rowAttr) ? rowAttr : ordinal,
      });
      keptRows++;
      keptChars += text.length;
      rows.push(cells);
    }

    parts.push(rows.length
      ? `## Sheet: ${sheet.name}\n\n${toMarkdownTable(rows)}`
      : `## Sheet: ${sheet.name}\n\n(empty)`);
  }

  let text = parts.join("\n\n");
  if (rowsDropped > 0) {
    text += `\n\n[truncated: ${rowsDropped} data rows were not indexed. This is not the full workbook.]`;
  }

  return { text, sheets: names, records, truncated: rowsDropped > 0, rowsDropped };
}

// ── PPTX ─────────────────────────────────────────────────────────────────────
async function extractPptx(buffer: Buffer, limits: OfficeZipLimits): Promise<{ text: string; slides: number; sections: DocumentSection[] }> {
  const zip = await openOfficeZip(buffer, limits);
  const budget = new ZipInflation(limits);

  // slide10 must not sort before slide2, so order numerically by slide index.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (p: string) => parseInt(/slide(\d+)\.xml$/.exec(p)![1], 10);
      return n(a) - n(b);
    });

  const parts: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const $s = await loadXml(zip, slidePaths[i], budget);
    if (!$s) continue;

    // Group text by paragraph so bullets stay on separate lines instead of
    // running together into one sentence.
    const lines: string[] = [];
    $s("*").each((_j: number, el: any) => {
      if (!el.tagName || localName(el.tagName) !== "p") return;
      const line = textNodesUnder($s, el).join("").trim();
      if (line) lines.push(line);
    });

    // Speaker notes routinely hold the actual narrative of a deck, which is
    // often the part a user is asking about.
    const $n = await loadXml(zip, `ppt/notesSlides/notesSlide${/slide(\d+)\.xml$/.exec(slidePaths[i])![1]}.xml`, budget);
    const notes: string[] = [];
    if ($n) {
      $n("*").each((_j: number, el: any) => {
        if (!el.tagName || localName(el.tagName) !== "p") return;
        const line = textNodesUnder($n, el).join("").trim();
        if (line) notes.push(line);
      });
    }

    parts.push([
      `## Slide ${i + 1}`,
      lines.length ? lines.join("\n") : "(no text)",
      notes.length ? `\n_Speaker notes:_\n${notes.join("\n")}` : "",
    ].filter(Boolean).join("\n"));
  }

  const sections = parts.map((text, i) => ({ text, locator: { slide: i + 1 } }));
  return { text: parts.join("\n\n"), slides: slidePaths.length, sections };
}

// ── CSV / TSV ────────────────────────────────────────────────────────────────
/**
 * Rows of a delimited file, quoted fields included (a quoted field may hold
 * the delimiter, a doubled quote, or a line break). `line` is the physical
 * line each row starts on, which is what a person sees in an editor.
 */
export function parseDelimited(text: string, delimiter: string): Array<{ cells: string[]; line: number }> {
  const rows: Array<{ cells: string[]; line: number }> = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") { quoted = true; continue; }
    if (ch === delimiter) { cells.push(field); field = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") {
      cells.push(field);
      rows.push({ cells, line: rowLine });
      cells = [];
      field = "";
      line++;
      rowLine = line;
      continue;
    }
    field += ch;
  }
  if (field !== "" || cells.length) {
    cells.push(field);
    rows.push({ cells, line: rowLine });
  }
  return rows;
}

/** One record per data row with the header repeated, the same shape a
 *  workbook row gets, under the same row and character ceilings. */
function csvRecords(text: string, filename: string, delimiter: string): { records: SpreadsheetRecord[]; rowsTotal: number; rowsDropped: number } {
  const label = filename.replace(/^.*[\\/]/, "");
  const records: SpreadsheetRecord[] = [];
  let header: string[] | null = null;
  let keyCol = 0;
  let keptChars = 0;
  let rowsTotal = 0;
  let rowsDropped = 0;
  for (const row of parseDelimited(text, delimiter)) {
    const cells = row.cells.map((v) => v.replace(/\s+/g, " ").trim());
    if (!cells.some((v) => v !== "")) continue;
    if (!header) {
      header = cells;
      keyCol = spreadsheetKeyColumn(header);
      continue;
    }
    rowsTotal++;
    const recordText = formatSpreadsheetRecord(label, header, cells);
    if (rowsDropped > 0 || spreadsheetRowExceedsCeiling(records.length, keptChars, recordText.length)) {
      rowsDropped++;
      continue;
    }
    records.push({ text: recordText, sheet: label, productId: (cells[keyCol] ?? "").trim(), rowNumber: row.line });
    keptChars += recordText.length;
  }
  return { records, rowsTotal, rowsDropped };
}

function recordSections(records: SpreadsheetRecord[]): DocumentSection[] {
  return records.map((r) => ({
    text: r.text,
    locator: { sheet: r.sheet, rowNumber: r.rowNumber, ...(r.productId ? { key: r.productId } : {}) },
  }));
}

function rowCoverage(kept: number, dropped: number, charsKept: number, lastKept?: string): ExtractionCoverage {
  const complete = dropped === 0;
  return {
    unit: "row",
    unitsTotal: kept + dropped,
    unitsKept: kept,
    charsKept,
    complete,
    ...(complete ? {} : {
      omitted: `${dropped} of ${kept + dropped} data rows${lastKept ? ` after ${lastKept}` : ""} were not read: the table is larger than the ` +
        `${MAX_XLSX_DATA_ROWS.toLocaleString("en-US")}-row / ${MAX_XLSX_RECORD_CHARS.toLocaleString("en-US")}-character safety limit.`,
    }),
  };
}

/** Comma unless the header line plainly uses semicolons or tabs instead. */
function sniffDelimiter(text: string): string {
  const first = text.slice(0, Math.max(0, text.indexOf("\n")) || text.length);
  const count = (ch: string) => first.split(ch).length - 1;
  const comma = count(",");
  if (count(";") > comma && count(";") >= count("\t")) return ";";
  if (count("\t") > comma) return "\t";
  return ",";
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string | undefined,
  filename: string,
  opts?: { acceptImages?: boolean; acceptVideos?: boolean; zipLimits?: Partial<OfficeZipLimits> },
): Promise<ExtractedFile> {
  const ext = EXT(filename);
  const zipLimits = officeZipLimits(opts?.zipLimits);
  const mime = (mimeType ?? "").toLowerCase();

  if (LEGACY_OFFICE.has(ext)) throw new LegacyOfficeFormatError(filename, ext);

  // Opt-in per caller, defaulting to the old refusal: chat attachments pass
  // acceptImages because the retained bytes travel on to the code-execution
  // container where python-pptx can actually place the pixels; Knowledge Base
  // ingestion must NOT pass it, or this stub would be chunked and embedded as
  // if it were document content. The stub is the image's "text floor" — it
  // tells the model what the attachment is and how to use it.
  if (opts?.acceptImages && IMAGE_EXTS.has(ext)) {
    const dims = imageDimensions(buffer, ext);
    const mb = buffer.length / (1024 * 1024);
    const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(buffer.length / 1024))} KB`;
    const text =
      `[Image attachment: ${filename} — ${ext.toUpperCase()}${dims ? `, ${dims.width}×${dims.height}px` : ""}, ${size}. ` +
      `If this image is also attached visually, look at it to decide placement from its content; otherwise rely on ` +
      `this description and the filename. When this run has code execution, the original image file is available in ` +
      `the container under this filename and can be placed into generated or edited documents ` +
      `(for a .pptx: python-pptx add_picture).]`;
    return { text, kind: "image", meta: { width: dims?.width, height: dims?.height } };
  }

  // Videos cannot be watched by any model; the stub plus the poster-frame
  // image the client uploads alongside (see file-attach.tsx) are the model's
  // whole view of the clip. Same opt-in rationale as images: chat attachments
  // only, Knowledge Base keeps refusing.
  if (opts?.acceptVideos && VIDEO_EXTS.has(ext)) {
    const info = mp4Info(buffer);
    const mb = buffer.length / (1024 * 1024);
    const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(buffer.length / 1024))} KB`;
    const base = filename.replace(/\.[^.]+$/, "");
    const facts = [
      info.durationSeconds ? `${info.durationSeconds}s` : null,
      info.width && info.height ? `${info.width}×${info.height}px` : null,
      size,
    ].filter(Boolean).join(", ");
    const text =
      `[Video attachment: ${filename} — MP4, ${facts}. Videos cannot be watched; a poster-frame image named ` +
      `"${base}-poster.png" may be attached alongside — look at it to understand the clip's content. When this run ` +
      `has code execution, the original video file is available in the container under this filename and can be ` +
      `embedded into a generated .pptx with python-pptx add_movie(path, left, top, width, height, ` +
      `poster_frame_image=..., mime_type="video/mp4"), using the poster image as the poster frame.]`;
    return { text, kind: "video", meta: { width: info.width, height: info.height, durationSeconds: info.durationSeconds } };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    const pdf = await extractPdf(buffer);
    const { kept, coverage } = keepSections(pdf.pages, "page");
    // Every page silent means the text is in the pixels. Recorded here, where
    // the reader already knows, rather than inferred later from an empty
    // string -- a caller seeing "" cannot tell a scan from a blank file, and
    // only one of those is worth rendering.
    const noTextAnywhere = kept.every((p) => !p.text.trim());
    // A scan's text is "", not pdf-parse's page markers.
    //
    // `pdf.text` is the reader's own assembly, and for a PDF with no text layer
    // it is NOT empty: it still carries the "-- 1 of 6 --" markers between the
    // pages, so a one-page scan comes back as 16 characters of punctuation.
    // Those are this reader's bookkeeping, not the document's content, and
    // handing them on makes a scan look readable to everything downstream --
    // `readable: true`, `readBy: "text"`, no unreadable note, and the vision
    // path (which fires only when there is no text) never reached at all.
    // Measured on a real image-only PDF before this line existed:
    // `{textLength: 16, meta: {empty: true, needsVision: true}}` and vision
    // skipped. A caller asking "is there text here" deserves "no".
    const text = noTextAnywhere
      ? ""
      : coverage.complete
        ? pdf.text
        : kept.map((p) => `${p.text}\n-- ${p.locator.page} of ${pdf.total} --`).join("\n") + truncationNotice(coverage);
    return {
      text,
      kind: "pdf",
      sections: kept,
      meta: {
        pages: pdf.total,
        truncated: !coverage.complete,
        coverage,
        empty: noTextAnywhere,
        ...(noTextAnywhere && pdf.total > 0 ? { needsVision: true } : {}),
      },
    };
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    const docx = await extractDocx(buffer, zipLimits);
    const { kept, coverage } = keepSections(docx.sections, "section");
    const text = coverage.complete ? docx.text : kept.map((s) => s.text).join("\n\n") + truncationNotice(coverage);
    return { text, kind: "docx", sections: kept, meta: { truncated: !coverage.complete, coverage, empty: !text.trim() } };
  }

  if (ext === "xlsx" || ext === "xlsm" || mime.includes("spreadsheetml")) {
    // Records are the indexed form, one per data row; `text` is the same rows
    // rendered as tables for callers that want to read them. Both are marked
    // truncated only when the safety ceiling dropped whole rows.
    const r = await extractXlsx(buffer, zipLimits);
    const charsKept = r.records.reduce((n, rec) => n + rec.text.length, 0);
    const last = r.records[r.records.length - 1];
    return {
      text: r.text,
      kind: "xlsx",
      records: r.records,
      sections: recordSections(r.records),
      meta: {
        sheets: r.sheets,
        truncated: r.truncated,
        rowsDropped: r.rowsDropped,
        coverage: rowCoverage(r.records.length, r.rowsDropped, charsKept, last ? `sheet ${last.sheet} row ${last.rowNumber}` : undefined),
        empty: !r.text.trim() && r.records.length === 0,
      },
    };
  }

  if (ext === "pptx" || mime.includes("presentationml")) {
    const r = await extractPptx(buffer, zipLimits);
    const { kept, coverage } = keepSections(r.sections, "slide");
    const text = coverage.complete ? r.text : kept.map((s) => s.text).join("\n\n") + truncationNotice(coverage);
    return { text, kind: "pptx", sections: kept, meta: { slides: r.slides, truncated: !coverage.complete, coverage, empty: !text.trim() } };
  }

  if (ext === "json" || mime === "application/json") {
    try {
      return textResult(JSON.stringify(JSON.parse(buffer.toString("utf-8")), null, 2), "json");
    } catch {
      // Malformed JSON is still readable text; fall through rather than fail.
      return textResult(buffer.toString("utf-8"), "text");
    }
  }

  // Checked before the generic text branch: "text/csv" also satisfies
  // mime.startsWith("text/"), so the looser test would claim it first and
  // report every CSV as plain text.
  if (["csv", "tsv"].includes(ext) || mime === "text/csv" || mime === "text/tab-separated-values") {
    if (looksBinary(buffer)) throw new UnsupportedFileTypeError(filename);
    const raw = buffer.toString("utf-8");
    const delimiter = ext === "tsv" || mime === "text/tab-separated-values" ? "\t" : sniffDelimiter(raw);
    const { records, rowsDropped } = csvRecords(raw, filename, delimiter);
    if (records.length === 0) return textResult(raw, "csv");
    const charsKept = records.reduce((n, rec) => n + rec.text.length, 0);
    const coverage = rowCoverage(records.length, rowsDropped, charsKept, `line ${records[records.length - 1].rowNumber}`);
    // The file as written; the rows are what get indexed. Past the ceiling the
    // row records are already incomplete (they repeat the header, so they fill
    // first), and the text is cut at a line break, never mid-row.
    const cut = raw.length > MAX_DOCUMENT_CHARS ? raw.lastIndexOf("\n", MAX_DOCUMENT_CHARS) : -1;
    const text = coverage.complete && cut <= 0 ? raw : (cut > 0 ? raw.slice(0, cut) : raw) + truncationNotice(coverage);
    return {
      text,
      kind: "csv",
      records,
      sections: recordSections(records),
      meta: { truncated: !coverage.complete, rowsDropped, coverage },
    };
  }

  if (["txt", "md", "markdown", "log"].includes(ext) || mime.startsWith("text/")) {
    if (looksBinary(buffer)) throw new UnsupportedFileTypeError(filename);
    return textResult(buffer.toString("utf-8"), "text");
  }

  // No silent binary fallback -- see looksBinary().
  throw new UnsupportedFileTypeError(filename);
}
