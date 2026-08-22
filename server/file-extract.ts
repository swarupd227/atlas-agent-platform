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

export type ExtractedKind = "text" | "csv" | "json" | "pdf" | "docx" | "xlsx" | "pptx";

export interface ExtractedFile {
  text: string;
  kind: ExtractedKind;
  /** Per-format detail worth surfacing in the UI ("3 sheets", "12 slides"). */
  meta: {
    sheets?: string[];
    slides?: number;
    truncated?: boolean;
    /** Set when a format was read but genuinely contained no text. */
    empty?: boolean;
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

/** Guards against a single pathological file exhausting context or the DB.
 *  Chunking downstream still applies; this is the hard ceiling. */
const MAX_TEXT_CHARS = 500_000;
const MAX_ROWS_PER_SHEET = 5_000;

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

/** Client-side `accept` string, kept next to the reader so the two cannot drift. */
export const UPLOAD_ACCEPT_ATTR =
  ".pdf,.docx,.xlsx,.xlsm,.pptx,.csv,.tsv,.txt,.md,.json";

export const SUPPORTED_TYPES_LABEL =
  "PDF, Word, Excel, PowerPoint, CSV, JSON, or text";

function clamp(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_TEXT_CHARS) + "\n\n[truncated]", truncated: true };
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

/** Local tag name, ignoring any XML namespace prefix (`a:t` -> `t`). */
function localName(tagName: string): string {
  const i = tagName.indexOf(":");
  return (i === -1 ? tagName : tagName.slice(i + 1)).toLowerCase();
}

async function loadXml(zip: any, path: string): Promise<any | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  const cheerio = await import("cheerio");
  return cheerio.load(await entry.async("string"), { xmlMode: true });
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
async function extractPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const html = await mammoth.convertToHtml({ buffer });
  if (html.value?.includes("<table")) {
    // Tables carry most of the meaning in the documents users actually upload
    // (rate cards, matrices); raw text extraction collapses them into an
    // unreadable run of cell values.
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html.value);
    $("table").each((_i: number, table: any) => {
      const rows: string[][] = [];
      $(table).find("tr").each((_j: number, tr: any) => {
        const cells: string[] = [];
        $(tr).find("th, td").each((_k: number, cell: any) => {
          cells.push($(cell).text().replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
        });
        if (cells.length) rows.push(cells);
      });
      if (rows.length) $(table).replaceWith(`\n\n${toMarkdownTable(rows)}\n\n`);
    });
    return $.root().text();
  }
  return (await mammoth.extractRawText({ buffer })).value;
}

function toMarkdownTable(rows: string[][]): string {
  if (!rows.length) return "";
  const width = Math.max(...rows.map((r) => r.length));
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

async function extractXlsx(buffer: Buffer): Promise<{ text: string; sheets: string[] }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // Shared strings are stored once and referenced by index from every cell.
  const shared: string[] = [];
  const $ss = await loadXml(zip, "xl/sharedStrings.xml");
  if ($ss) {
    $ss("*").each((_i: number, el: any) => {
      if (el.tagName && localName(el.tagName) === "si") {
        shared.push(textNodesUnder($ss, el).join(""));
      }
    });
  }

  // Sheet display names live in workbook.xml; the file each maps to comes from
  // the rels file. Without the mapping, sheet order and names can disagree.
  const $wb = await loadXml(zip, "xl/workbook.xml");
  const $rels = await loadXml(zip, "xl/_rels/workbook.xml.rels");
  const relTarget = new Map<string, string>();
  if ($rels) {
    $rels("*").each((_i: number, el: any) => {
      if (el.tagName && localName(el.tagName) === "relationship") {
        const id = $rels(el).attr("Id");
        const target = $rels(el).attr("Target");
        if (id && target) relTarget.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
      }
    });
  }

  const sheets: Array<{ name: string; path: string }> = [];
  if ($wb) {
    $wb("*").each((_i: number, el: any) => {
      if (el.tagName && localName(el.tagName) === "sheet") {
        const name = $wb(el).attr("name") ?? `Sheet${sheets.length + 1}`;
        const rid = $wb(el).attr("r:id") ?? $wb(el).attr("id");
        const target = rid ? relTarget.get(rid) : undefined;
        sheets.push({ name, path: `xl/${target ?? `worksheets/sheet${sheets.length + 1}.xml`}` });
      }
    });
  }
  if (!sheets.length) sheets.push({ name: "Sheet1", path: "xl/worksheets/sheet1.xml" });

  const parts: string[] = [];
  const names: string[] = [];
  for (const sheet of sheets) {
    const $s = await loadXml(zip, sheet.path);
    if (!$s) continue;
    names.push(sheet.name);

    const rows: string[][] = [];
    $s("*").each((_i: number, el: any) => {
      if (!el.tagName || localName(el.tagName) !== "row") return;
      if (rows.length >= MAX_ROWS_PER_SHEET) return;
      const cells: string[] = [];
      $s(el).find("*").each((_j: number, c: any) => {
        if (!c.tagName || localName(c.tagName) !== "c") return;
        const type = $s(c).attr("t");
        let value = "";
        if (type === "s") {
          // Shared-string cell: <v> holds an index into sharedStrings.
          const idx = parseInt($s(c).find("*").filter((_k: number, v: any) => v.tagName && localName(v.tagName) === "v").first().text(), 10);
          value = Number.isFinite(idx) ? (shared[idx] ?? "") : "";
        } else if (type === "inlineStr") {
          value = textNodesUnder($s, c).join("");
        } else {
          value = $s(c).find("*").filter((_k: number, v: any) => v.tagName && localName(v.tagName) === "v").first().text();
        }
        const at = colIndex($s(c).attr("r") ?? "A");
        while (cells.length < at) cells.push("");
        cells.push(value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim());
      });
      if (cells.some((c) => c !== "")) rows.push(cells);
    });

    parts.push(rows.length
      ? `## Sheet: ${sheet.name}\n\n${toMarkdownTable(rows)}`
      : `## Sheet: ${sheet.name}\n\n(empty)`);
  }

  return { text: parts.join("\n\n"), sheets: names };
}

// ── PPTX ─────────────────────────────────────────────────────────────────────
async function extractPptx(buffer: Buffer): Promise<{ text: string; slides: number }> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);

  // slide10 must not sort before slide2, so order numerically by slide index.
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => {
      const n = (p: string) => parseInt(/slide(\d+)\.xml$/.exec(p)![1], 10);
      return n(a) - n(b);
    });

  const parts: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const $s = await loadXml(zip, slidePaths[i]);
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
    const $n = await loadXml(zip, `ppt/notesSlides/notesSlide${/slide(\d+)\.xml$/.exec(slidePaths[i])![1]}.xml`);
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

  return { text: parts.join("\n\n"), slides: slidePaths.length };
}

// ── Entry point ──────────────────────────────────────────────────────────────
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string | undefined,
  filename: string,
): Promise<ExtractedFile> {
  const ext = EXT(filename);
  const mime = (mimeType ?? "").toLowerCase();

  if (LEGACY_OFFICE.has(ext)) throw new LegacyOfficeFormatError(filename, ext);

  if (ext === "pdf" || mime === "application/pdf") {
    const { text, truncated } = clamp(await extractPdf(buffer));
    return { text, kind: "pdf", meta: { truncated, empty: !text.trim() } };
  }

  if (ext === "docx" || mime.includes("wordprocessingml")) {
    const { text, truncated } = clamp(await extractDocx(buffer));
    return { text, kind: "docx", meta: { truncated, empty: !text.trim() } };
  }

  if (ext === "xlsx" || ext === "xlsm" || mime.includes("spreadsheetml")) {
    const r = await extractXlsx(buffer);
    const { text, truncated } = clamp(r.text);
    return { text, kind: "xlsx", meta: { sheets: r.sheets, truncated, empty: !text.trim() } };
  }

  if (ext === "pptx" || mime.includes("presentationml")) {
    const r = await extractPptx(buffer);
    const { text, truncated } = clamp(r.text);
    return { text, kind: "pptx", meta: { slides: r.slides, truncated, empty: !text.trim() } };
  }

  if (ext === "json" || mime === "application/json") {
    try {
      const { text, truncated } = clamp(JSON.stringify(JSON.parse(buffer.toString("utf-8")), null, 2));
      return { text, kind: "json", meta: { truncated } };
    } catch {
      // Malformed JSON is still readable text; fall through rather than fail.
      const { text, truncated } = clamp(buffer.toString("utf-8"));
      return { text, kind: "text", meta: { truncated } };
    }
  }

  // Checked before the generic text branch: "text/csv" also satisfies
  // mime.startsWith("text/"), so the looser test would claim it first and
  // report every CSV as plain text.
  if (["csv", "tsv"].includes(ext) || mime === "text/csv" || mime === "text/tab-separated-values") {
    if (looksBinary(buffer)) throw new UnsupportedFileTypeError(filename);
    const { text, truncated } = clamp(buffer.toString("utf-8"));
    return { text, kind: "csv", meta: { truncated } };
  }

  if (["txt", "md", "markdown", "log"].includes(ext) || mime.startsWith("text/")) {
    if (looksBinary(buffer)) throw new UnsupportedFileTypeError(filename);
    const { text, truncated } = clamp(buffer.toString("utf-8"));
    return { text, kind: "text", meta: { truncated } };
  }

  // No silent binary fallback -- see looksBinary().
  throw new UnsupportedFileTypeError(filename);
}
