/**
 * Reading a large attached file in parts.
 *
 * A chat attachment used to be inlined whole: a 300-page PDF or a 100,000-row
 * workbook became one prompt the model could not take, and before that the
 * extractor had already cut every format after its first 500,000 characters
 * without saying so in the chat. Now a file that fits the turn's budget is
 * still inlined whole, unchanged; one that does not is shown as a map of the
 * document, its opening section and the sections most relevant to the
 * question, with a plain statement of what was not shown -- and the model can
 * search the whole file and read any section by number (search_attachment,
 * read_attachment_section).
 *
 * The sections are the reader's own (a page, a slide, a heading's text, a
 * spreadsheet or CSV row) re-read from the uploaded bytes, so each passage
 * says where it is. A file stored without bytes falls back to its extracted
 * text split into runs of lines.
 *
 * No database access here: callers pass the file rows in.
 */
import { knowledgeLimits } from "./config";
import { extractTextFromFile, filenameForLog, splitTextSections, type DocumentSection, type ExtractionCoverage, type SectionLocator } from "./file-extract";

/** "page 12", "sheet Prices, row 4031", "lines 120–188, "Termination"" -- "" when the section has no position. */
export function describeLocator(loc: SectionLocator): string {
  const parts: string[] = [];
  if (loc.page !== undefined) parts.push(`page ${loc.page}`);
  if (loc.slide !== undefined) parts.push(`slide ${loc.slide}`);
  if (loc.rowNumber !== undefined) parts.push(`${loc.sheet ? `sheet ${loc.sheet}, ` : ""}row ${loc.rowNumber}`);
  if (loc.lineStart !== undefined) parts.push(loc.lineEnd && loc.lineEnd !== loc.lineStart ? `lines ${loc.lineStart}–${loc.lineEnd}` : `line ${loc.lineStart}`);
  if (loc.heading) parts.push(`"${loc.heading}"`);
  return parts.join(", ");
}

export interface AttachmentFile {
  id: string;
  filename: string;
  mimeType?: string | null;
  extractedText?: string | null;
  content?: Buffer | null;
}

export interface LoadedSections {
  sections: DocumentSection[];
  coverage?: ExtractionCoverage;
  /** "file" when re-read from the upload's bytes, "text" when split from the stored extraction. */
  from: "file" | "text";
}

/** Characters inlined across all of a turn's attachments before selection begins (~30k tokens). */
export const DEFAULT_ATTACHMENT_BUDGET_CHARS = knowledgeLimits.attachmentBudgetChars;
/** Lines per section when a file's text is split without the reader's own structure. */
const TEXT_SECTION_CHARS = 4_000;
/** Most a single read_attachment_section call returns. */
export const MAX_READ_CHARS = knowledgeLimits.attachmentReadChars;
/** Most sections one read returns. */
const MAX_READ_SECTIONS = 200;

// ── Loading ──────────────────────────────────────────────────────────────────

const cache = new Map<string, LoadedSections>();
let cachedChars = 0;
/** Bound on the cached sections' text, across files. */
const CACHE_CHARS = knowledgeLimits.attachmentCacheChars;

function sizeOf(loaded: LoadedSections): number {
  let n = 0;
  for (const s of loaded.sections) n += s.text.length;
  return n;
}

function remember(id: string, loaded: LoadedSections) {
  const size = sizeOf(loaded);
  if (size > CACHE_CHARS) return;
  while (cachedChars + size > CACHE_CHARS && cache.size > 0) {
    const oldest = cache.keys().next().value as string;
    cachedChars -= sizeOf(cache.get(oldest)!);
    cache.delete(oldest);
  }
  cache.set(id, loaded);
  cachedChars += size;
}

/** Test hook. */
export function clearSectionCache() {
  cache.clear();
  cachedChars = 0;
}

export async function loadSections(file: AttachmentFile): Promise<LoadedSections> {
  const hit = cache.get(file.id);
  if (hit) {
    cache.delete(file.id);
    cache.set(file.id, hit);
    return hit;
  }
  let loaded: LoadedSections | null = null;
  if (file.content && file.content.length > 0) {
    try {
      const extracted = await extractTextFromFile(file.content, file.mimeType ?? undefined, file.filename);
      if (extracted.sections && extracted.sections.length > 0) {
        loaded = { sections: extracted.sections, coverage: extracted.meta.coverage, from: "file" };
      }
    } catch {
      // Images, video and anything the reader refuses fall back to the stored text.
    }
  }
  if (!loaded) loaded = { sections: splitTextSections(file.extractedText ?? "", TEXT_SECTION_CHARS), from: "text" };
  remember(file.id, loaded);
  return loaded;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it its me my of on or our please show tell that the this to was we what when where which who why will with you your about".split(" "),
);

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
}

/** Query words worth matching, and identifier-like tokens (a digit, or letters joined by - _ . /) matched verbatim. */
export function queryTerms(query: string): { terms: string[]; identifiers: string[] } {
  const terms = Array.from(new Set(words(query).filter((w) => !STOPWORDS.has(w)))).slice(0, 32);
  const identifiers = new Set<string>();
  for (const raw of query.split(/[\s,;()"'?!]+/)) {
    const t = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (t.length >= 3 && t.length <= 64 && (/\d/.test(t) || /[A-Za-z0-9][-_./][A-Za-z0-9]/.test(t))) identifiers.add(t.toLowerCase());
  }
  return { terms, identifiers: Array.from(identifiers).slice(0, 8) };
}

/**
 * BM25 over the sections, plus a large bonus for a section that contains an
 * identifier from the query verbatim, so "what does the sheet say about
 * AB-1234" finds that row even when its other words are common.
 */
export function scoreSections(sections: DocumentSection[], query: string): number[] {
  const { terms, identifiers } = queryTerms(query);
  const scores = new Array<number>(sections.length).fill(0);
  if (terms.length === 0 && identifiers.length === 0) return scores;

  const termSet = new Set(terms);
  const tf: Array<Map<string, number>> = [];
  const lengths: number[] = [];
  const df = new Map<string, number>();
  for (const s of sections) {
    const counts = new Map<string, number>();
    const ws = words(s.text);
    lengths.push(ws.length);
    for (const w of ws) if (termSet.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    for (const w of counts.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    tf.push(counts);
  }
  const n = sections.length;
  const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(1, n) || 1;
  const k1 = 1.2;
  const b = 0.75;
  for (let i = 0; i < n; i++) {
    let score = 0;
    for (const [w, f] of tf[i]) {
      const idf = Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * lengths[i]) / avg)));
    }
    if (identifiers.length) {
      const lower = sections[i].text.toLowerCase();
      const key = String(sections[i].locator.key ?? "").toLowerCase();
      for (const id of identifiers) {
        if (key && key === id) score += 100;
        else if (containsWord(lower, id)) score += 50;
      }
    }
    scores[i] = score;
  }
  return scores;
}

function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = at + 1;
  }
}

// ── Selection for the prompt ─────────────────────────────────────────────────

export function sectionLabel(section: DocumentSection, index: number): string {
  const where = describeLocator(section.locator);
  return `Section ${index + 1}${where ? ` — ${where}` : ""}`;
}

/** What the document holds, in a few lines: its pages, sheets and row ranges, slides or headings. */
export function documentMap(sections: DocumentSection[]): string {
  if (sections.length === 0) return "(empty)";
  const first = sections[0].locator;
  if (first.page !== undefined) return `${sections.length} sections, one per page (pages ${first.page}–${sections[sections.length - 1].locator.page}).`;
  if (first.slide !== undefined) return `${sections.length} sections, one per slide.`;
  if (first.rowNumber !== undefined) {
    const sheets = new Map<string, { from: number; to: number; count: number }>();
    for (const s of sections) {
      const name = s.locator.sheet ?? "";
      const row = s.locator.rowNumber ?? 0;
      const e = sheets.get(name);
      if (!e) sheets.set(name, { from: row, to: row, count: 1 });
      else { e.to = Math.max(e.to, row); e.from = Math.min(e.from, row); e.count++; }
    }
    const parts = Array.from(sheets.entries()).map(([name, e]) => `${name || "rows"}: ${e.count} rows (rows ${e.from}–${e.to})`);
    return `${sections.length} sections, one per data row. ${parts.join("; ")}.`;
  }
  const headings = sections.map((s, i) => (s.locator.heading ? `${i + 1}. ${s.locator.heading}` : null)).filter(Boolean) as string[];
  const shown = headings.slice(0, 60);
  return [
    `${sections.length} sections${sections[sections.length - 1].locator.lineEnd ? ` (lines 1–${sections[sections.length - 1].locator.lineEnd})` : ""}.`,
    ...(shown.length ? [`Headings: ${shown.join("; ")}${headings.length > shown.length ? `; … ${headings.length - shown.length} more` : ""}`] : []),
  ].join("\n");
}

export interface SelectionResult {
  text: string;
  shown: number[];
  total: number;
  charsShown: number;
  charsTotal: number;
}

/**
 * The opening section and then the best-scoring ones until the budget is
 * spent, rendered in document order with the gaps marked. With no useful
 * query this is the start of the document, in order -- and still says so.
 */
export function selectSections(sections: DocumentSection[], query: string, budgetChars: number): SelectionResult {
  const charsTotal = sections.reduce((n, s) => n + s.text.length, 0);
  const rendered = (i: number) => `[${sectionLabel(sections[i], i)}]\n${sections[i].text.trim()}`;
  const chosen = new Set<number>();
  let used = 0;
  const take = (i: number, allowCut = false): boolean => {
    if (chosen.has(i) || !sections[i].text.trim()) return false;
    const cost = rendered(i).length + 2;
    if (used + cost > budgetChars && !(allowCut && chosen.size === 0)) return false;
    chosen.add(i);
    used += Math.min(cost, budgetChars);
    return true;
  };

  // The opening gives the model what the document is; capped at a quarter of the budget.
  const firstIdx = sections.findIndex((s) => s.text.trim());
  if (firstIdx >= 0 && rendered(firstIdx).length <= budgetChars / 4) take(firstIdx);

  const scores = scoreSections(sections, query);
  const ranked = scores
    .map((score, i) => ({ score, i }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);
  for (const r of ranked) {
    if (used >= budgetChars) break;
    take(r.i, true);
  }
  // Whatever budget is left goes to the start of the document, in order.
  for (let i = 0; i < sections.length && used < budgetChars; i++) take(i);

  const order = Array.from(chosen).sort((a, b) => a - b);
  const blocks: string[] = [];
  let prev = -1;
  let charsShown = 0;
  for (const i of order) {
    if (i > prev + 1) blocks.push(`[… sections ${prev + 2}–${i} not shown …]`);
    let block = rendered(i);
    if (block.length > budgetChars) block = `${block.slice(0, budgetChars)}\n[… section ${i + 1} continues; read it with read_attachment_section …]`;
    blocks.push(block);
    const sectionText = sections[i].text.trim();
    if (block.length > budgetChars) {
      const headerLen = rendered(i).length - sectionText.length;
      charsShown += Math.max(0, Math.min(sectionText.length, budgetChars - headerLen));
    } else {
      charsShown += sectionText.length;
    }
    prev = i;
  }
  if (prev < sections.length - 1) blocks.push(`[… sections ${prev + 2}–${sections.length} not shown …]`);
  return { text: blocks.join("\n\n"), shown: order, total: sections.length, charsShown, charsTotal };
}

// ── Tools ────────────────────────────────────────────────────────────────────

export { SEARCH_ATTACHMENT_TOOL, READ_ATTACHMENT_SECTION_TOOL, ATTACHMENT_TOOL_GUIDE, SEARCH_ATTACHMENT_SCHEMA, READ_ATTACHMENT_SECTION_SCHEMA } from "./attachment-tool-defs";

/** Which attached file a tool call means: by id, exact name, or a name it starts with; the only one when there is one. */
export function resolveFile<T extends { id: string; filename: string }>(files: T[], ref: unknown): T | { error: string } {
  const shown = (name: string) => filenameForLog(name);
  const label = (file: T) => `"${shown(file.filename)}" (fileId: ${file.id})`;
  const raw = typeof ref === "string" ? ref.trim() : "";
  if (!raw) {
    if (files.length === 1) return files[0];
    return { error: `Name the file: one of ${files.map(label).join(", ")}.` };
  }
  const byId = files.find((f) => f.id === raw);
  if (byId) return byId;

  const want = shown(raw);
  const rawLower = raw.toLowerCase();
  const shownLower = want.toLowerCase();
  const choose = (matches: T[]): T | { error: string } | undefined => {
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      return { error: `"${want}" matches more than one attached file. Use its fileId: ${matches.map((f) => f.id).join(", ")}.` };
    }
  };

  const exact = choose(files.filter((f) => f.filename.toLowerCase() === rawLower));
  if (exact) return exact;
  const displayed = choose(files.filter((f) => shown(f.filename).toLowerCase() === shownLower));
  if (displayed) return displayed;
  const prefixed = choose(files.filter((f) =>
    f.filename.toLowerCase().startsWith(rawLower) || shown(f.filename).toLowerCase().startsWith(shownLower),
  ));
  return prefixed ?? { error: `No attached file named "${want}". Attached: ${files.map(label).join(", ")}.` };
}

function excerpt(text: string, query: string, max = 1_200): string {
  if (text.length <= max) return text;
  const { terms, identifiers } = queryTerms(query);
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of [...identifiers, ...terms]) {
    at = lower.indexOf(t);
    if (at >= 0) break;
  }
  const start = Math.max(0, Math.min(text.length - max, at < 0 ? 0 : at - Math.floor(max / 3)));
  return `${start > 0 ? "…" : ""}${text.slice(start, start + max)}${start + max < text.length ? "…" : ""}`;
}

export async function searchAttachments(
  files: AttachmentFile[],
  args: { file?: string; query?: string; limit?: number },
  limits?: { maxResults?: number; maxSections?: number },
): Promise<Record<string, unknown>> {
  const query = String(args.query ?? "").trim();
  if (!query) return { ok: false, error: "Say what to look for (query)." };
  const scope = args.file ? resolveFile(files, args.file) : null;
  if (scope && "error" in scope) return { ok: false, error: scope.error };
  const targets = scope ? [scope as AttachmentFile] : files;
  const resultCap = limits?.maxResults ?? knowledgeLimits.attachmentSearchResults;
  const limit = Math.min(Math.max(1, Number(args.limit) || 8), resultCap);
  const sectionBudget = limits?.maxSections ?? knowledgeLimits.attachmentSearchSections;
  type Hit = { fileId: string; file: string; section: number; location: string; score: number; raw: number; text: string };
  const best: Hit[] = [];
  let matches = 0;
  let searched = 0;
  let remaining = sectionBudget;
  let stopped = false;
  const incomplete: string[] = [];
  const consider = (hit: Omit<Hit, "text">, text: string) => {
    matches++;
    const worse = (a: Hit, b: Hit) => a.raw < b.raw || (a.raw === b.raw && a.section > b.section);
    if (best.length < limit) {
      best.push({ ...hit, text: excerpt(text, query) });
      return;
    }
    let worst = 0;
    for (let n = 1; n < best.length; n++) if (worse(best[n], best[worst])) worst = n;
    if (hit.raw > best[worst].raw || (hit.raw === best[worst].raw && hit.section < best[worst].section)) {
      best[worst] = { ...hit, text: excerpt(text, query) };
    }
  };
  for (const f of targets) {
    if (remaining <= 0) { stopped = true; break; }
    const { sections, coverage } = await loadSections(f);
    const take = Math.min(remaining, sections.length);
    if (take < sections.length) stopped = true;
    const window = sections.slice(0, take);
    searched += window.length;
    remaining -= window.length;
    if (coverage && !coverage.complete) incomplete.push(`${filenameForLog(f.filename)}: ${coverage.omitted ?? "part of the file could not be read"}`);
    const scores = scoreSections(window, query);
    const fileName = filenameForLog(f.filename);
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] <= 0) continue;
      consider({
        fileId: f.id,
        file: fileName,
        section: i + 1,
        location: describeLocator(window[i].locator),
        score: Math.round(scores[i] * 100) / 100,
        raw: scores[i],
      }, window[i].text);
    }
  }
  best.sort((a, b) => b.raw - a.raw || a.section - b.section);
  const results = best.map((hit) => ({ fileId: hit.fileId, file: hit.file, section: hit.section, location: hit.location, score: hit.score, text: hit.text }));
  return {
    ok: true,
    query,
    sectionsSearched: searched,
    matches,
    results,
    ...(matches > limit ? { more: `${matches - limit} more sections match; narrow the query or raise limit (max ${resultCap}).` } : {}),
    ...(matches === 0 ? { note: "No section contains these words. Try other words, or read sections directly." } : {}),
    ...(stopped ? { stoppedEarly: `Searched ${searched} sections and stopped at the ${sectionBudget}-section limit.` } : {}),
    ...(incomplete.length ? { notRead: incomplete } : {}),
  };
}

export async function readAttachmentSections(
  files: AttachmentFile[],
  args: { file?: string; section?: number; count?: number; page?: number; slide?: number; sheet?: string; row?: number },
): Promise<Record<string, unknown>> {
  const target = resolveFile(files, args.file);
  if ("error" in target) return { ok: false, error: target.error };
  const { sections, coverage } = await loadSections(target as AttachmentFile);
  if (sections.length === 0) return { ok: false, error: `${filenameForLog(target.filename)} has no readable text.` };

  let start = -1;
  if (Number.isFinite(Number(args.section)) && Number(args.section) >= 1) start = Math.floor(Number(args.section)) - 1;
  else if (args.page !== undefined) start = sections.findIndex((s) => s.locator.page === Number(args.page));
  else if (args.slide !== undefined) start = sections.findIndex((s) => s.locator.slide === Number(args.slide));
  else if (args.row !== undefined) {
    const sheet = args.sheet ? String(args.sheet).toLowerCase() : null;
    start = sections.findIndex((s) => s.locator.rowNumber === Number(args.row) && (!sheet || String(s.locator.sheet ?? "").toLowerCase() === sheet));
  } else start = 0;
  if (start < 0 || start >= sections.length) {
    return { ok: false, error: `No such section in ${filenameForLog(target.filename)}; it has sections 1–${sections.length}.`, documentMap: documentMap(sections) };
  }

  const count = Math.min(Math.max(1, Math.floor(Number(args.count) || 1)), MAX_READ_SECTIONS);
  const out: Array<{ section: number; location: string; text: string }> = [];
  let used = 0;
  let cut = false;
  for (let i = start; i < Math.min(sections.length, start + count); i++) {
    let text = sections[i].text;
    if (used + text.length > MAX_READ_CHARS) {
      if (out.length > 0) break;
      text = text.slice(0, MAX_READ_CHARS);
      cut = true;
    }
    out.push({ section: i + 1, location: describeLocator(sections[i].locator), text });
    used += text.length;
  }
  const last = out[out.length - 1].section;
  return {
    ok: true,
    fileId: target.id,
    file: filenameForLog(target.filename),
    totalSections: sections.length,
    sections: out,
    ...(cut ? { note: `Section ${start + 1} is longer than ${MAX_READ_CHARS} characters; only its start is shown.` } : {}),
    ...(last < sections.length ? { next: last + 1 } : { next: null }),
    ...(coverage && !coverage.complete ? { notRead: coverage.omitted } : {}),
  };
}
