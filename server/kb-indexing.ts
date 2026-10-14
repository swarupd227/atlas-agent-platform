/**
 * From an extracted document to searchable knowledge-base chunks.
 *
 * Every section the extractor produced (a page, a slide, a heading's text, a
 * spreadsheet or CSV row, a run of lines) is chunked on its own and each chunk
 * carries where it came from. Nothing is cut from the end of a document here:
 * what the extractor kept is all indexed, and what it could not keep is
 * reported by its coverage record, which travels into the source's status.
 *
 * Chunks are stored and embedded in bounded batches. An embedding batch that
 * fails is retried; one that still fails leaves its chunks stored without a
 * vector -- exact and keyword lookup still reach them -- and the source is
 * marked "partial" with the count, never "processed".
 *
 * The database and the embedding model are passed in (IndexDeps), so this is
 * testable without either.
 */
import type { DocumentSection, ExtractionCoverage, SectionLocator, SpreadsheetRecord } from "./file-extract";

// ── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");

  const segments: { type: "text" | "table"; content: string }[] = [];
  let currentText: string[] = [];
  let tableLines: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const isTableRow = line.startsWith("|") && line.endsWith("|");
    const isSeparator = isTableRow && /^\|[\s\-:|]+\|$/.test(line);

    if (!inTable && isTableRow) {
      if (currentText.length > 0) {
        const joined = currentText.join("\n").trim();
        if (joined) segments.push({ type: "text", content: joined });
        currentText = [];
      }
      inTable = true;
      tableLines = [lines[i]];
    } else if (inTable && (isTableRow || isSeparator)) {
      tableLines.push(lines[i]);
    } else if (inTable && !isTableRow) {
      if (line === "" && i + 1 < lines.length) {
        const nextLine = lines[i + 1]?.trim() || "";
        if (nextLine.startsWith("|") && nextLine.endsWith("|")) {
          continue;
        }
      }
      segments.push({ type: "table", content: tableLines.join("\n") });
      tableLines = [];
      inTable = false;
      currentText.push(lines[i]);
    } else {
      currentText.push(lines[i]);
    }
  }

  if (inTable && tableLines.length > 0) {
    segments.push({ type: "table", content: tableLines.join("\n") });
  }
  if (currentText.length > 0) {
    const joined = currentText.join("\n").trim();
    if (joined) segments.push({ type: "text", content: joined });
  }

  for (const seg of segments) {
    if (seg.type === "table") {
      const tLines = seg.content.split("\n").filter(l => l.trim());
      if (tLines.length < 2) {
        chunks.push(seg.content.trim());
        continue;
      }

      const headerLine = tLines[0];
      const sepIdx = tLines.findIndex(l => /^\|[\s\-:|]+\|$/.test(l.trim()));
      const separatorLine = sepIdx >= 0 ? tLines[sepIdx] : "| " + headerLine.split("|").filter(c => c.trim()).map(() => "---").join(" | ") + " |";
      const dataLines = tLines.filter((_, idx) => idx !== 0 && idx !== sepIdx);

      if (seg.content.length <= chunkSize || dataLines.length === 0) {
        chunks.push(seg.content.trim());
      } else {
        let currentChunkLines: string[] = [headerLine, separatorLine];
        let currentLen = headerLine.length + separatorLine.length + 2;

        for (const line of dataLines) {
          if (currentLen + line.length + 1 > chunkSize && currentChunkLines.length > 2) {
            chunks.push(currentChunkLines.join("\n"));
            currentChunkLines = [headerLine, separatorLine, line];
            currentLen = headerLine.length + separatorLine.length + line.length + 3;
          } else {
            currentChunkLines.push(line);
            currentLen += line.length + 1;
          }
        }
        if (currentChunkLines.length > 2) {
          chunks.push(currentChunkLines.join("\n"));
        }
      }
    } else {
      const sentences = seg.content.split(/(?<=[.!?\n])\s+/);
      let current = "";
      for (const sentence of sentences) {
        if ((current + " " + sentence).trim().length > chunkSize && current.length > 0) {
          chunks.push(current.trim());
          const words = current.split(" ");
          const overlapWords = words.slice(-Math.floor(overlap / 5));
          current = overlapWords.join(" ") + " " + sentence;
        } else {
          current = current ? current + " " + sentence : sentence;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }

  return chunks.flatMap((c) => splitOversizedChunk(c, chunkSize));
}

/**
 * Sentence splitting only breaks on ". ", "! ", "? " or a newline followed by
 * whitespace, so text with none of those -- a CSV, one line per row -- came out
 * as a single chunk of the whole file, too long to embed (the embedding model
 * takes at most 8,192 tokens) and too long to be a useful passage. A chunk more
 * than twice the target size is split at line breaks, and a single overlong
 * line into target-size pieces; normal chunks are returned unchanged.
 */
export function splitOversizedChunk(chunk: string, chunkSize: number): string[] {
  const size = Math.max(chunkSize, 64);
  if (chunk.length <= size * 2) return [chunk];
  const pieces: string[] = [];
  let current = "";
  const flush = () => { if (current.trim()) pieces.push(current.trim()); current = ""; };
  for (const line of chunk.split("\n")) {
    if (line.length > size) {
      flush();
      for (let i = 0; i < line.length; i += size) pieces.push(line.slice(i, i + size));
      continue;
    }
    if (current && current.length + line.length + 1 > size) flush();
    current = current ? `${current}\n${line}` : line;
  }
  flush();
  return pieces;
}

export interface PreparedChunk {
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * A row record stays one chunk -- its identifier next to every other cell --
 * unless it is longer than this, when it is split into labelled parts rather
 * than handed to the embedding model to be clipped (the model's input cap is
 * MAX_EMBEDDING_INPUT_CHARS, 20,000).
 */
export const MAX_ROW_CHUNK_CHARS = 8_000;

function locatorMetadata(loc: SectionLocator): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(loc)) if (v !== undefined && v !== "") out[k] = v;
  // Earlier chunks name a row's identifier productId; the exact-match lookup
  // reads both names.
  if (loc.key) out.productId = loc.key;
  return out;
}

export interface ChunkAudit {
  sections: number;
  /** Sections with text that produced at least one chunk. */
  sectionsChunked: number;
  /** Sections with no text at all (a blank page), which correctly have no chunk. */
  emptySections: number;
  /** Indexes of sections with text that produced no chunk. Must be empty. */
  unaccounted: number[];
}

/**
 * Chunks for every section, in order, each carrying the section's locator and
 * index. Row sections (a locator with rowNumber) are one chunk each; every
 * other section goes through chunkText. The audit proves no section with text
 * was dropped on the way.
 */
export function chunkSections(
  sections: DocumentSection[],
  chunkSize: number = 512,
  overlap: number = 50,
): { chunks: PreparedChunk[]; audit: ChunkAudit } {
  const chunks: PreparedChunk[] = [];
  const audit: ChunkAudit = { sections: sections.length, sectionsChunked: 0, emptySections: 0, unaccounted: [] };

  sections.forEach((section, sectionIndex) => {
    const text = section.text ?? "";
    if (!text.trim()) {
      audit.emptySections++;
      return;
    }
    const base = { ...locatorMetadata(section.locator), sectionIndex };
    let pieces: string[];
    if (section.locator.rowNumber !== undefined) {
      if (text.length <= MAX_ROW_CHUNK_CHARS) {
        pieces = [text];
      } else {
        const label = text.split("\n", 1)[0];
        const parts = splitOversizedChunk(text, Math.floor(MAX_ROW_CHUNK_CHARS / 2));
        pieces = parts.map((p, i) => (i === 0 ? p : `${label} (row ${section.locator.rowNumber}, continued)\n${p}`));
      }
    } else {
      pieces = chunkText(text, chunkSize, overlap);
    }
    pieces = pieces.filter((p) => p.trim());
    if (pieces.length === 0) {
      audit.unaccounted.push(sectionIndex);
      return;
    }
    audit.sectionsChunked++;
    pieces.forEach((content, part) => {
      chunks.push({ content, metadata: pieces.length > 1 ? { ...base, part: part + 1, parts: pieces.length } : base });
    });
  });

  return { chunks, audit };
}

/**
 * Chunks for a source whose original file is not stored (text and URL
 * sources, and documents uploaded before files were kept). A workbook stored
 * with per-row records in its metadata is indexed from those records; any
 * other text goes through chunkText.
 */
export const SPREADSHEET_INDEXING = "spreadsheet-records";

export function chunksForSourceContent(
  text: string,
  metadata: unknown,
  chunkSize: number = 512,
  chunkOverlap: number = 50,
): PreparedChunk[] {
  const records = spreadsheetRecordsFromMetadata(metadata);
  if (records) {
    return chunkSections(records.map((r) => ({
      text: r.text,
      locator: { sheet: r.sheet, rowNumber: r.rowNumber, ...(r.productId ? { key: r.productId } : {}) },
    })), chunkSize, chunkOverlap).chunks;
  }
  return chunkText(text, chunkSize, chunkOverlap).map((content) => ({ content, metadata: {} }));
}

function spreadsheetRecordsFromMetadata(metadata: unknown): SpreadsheetRecord[] | null {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  if (meta.indexing !== SPREADSHEET_INDEXING || !Array.isArray(meta.records)) return null;
  const records: SpreadsheetRecord[] = [];
  for (const row of meta.records) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !r.text.trim()) continue;
    records.push({
      text: r.text,
      productId: typeof r.productId === "string" ? r.productId : "",
      sheet: typeof r.sheet === "string" ? r.sheet : "",
      rowNumber: typeof r.rowNumber === "number" ? r.rowNumber : 0,
    });
  }
  return records;
}

/**
 * Text stored by the extractor before this module existed, which kept only
 * the first 500,000 characters of a document (ending it "[truncated]") or the
 * first rows of a workbook (starting it "[truncated: N data rows"). Chunking
 * it again cannot recover what was cut; only a new upload can.
 */
export function legacyTruncationGap(text: string): string | null {
  if (/\n\n\[truncated\]\s*$/.test(text) || /^\[truncated: \d+ data rows/.test(text)) {
    return "This source was stored by an earlier version that kept only the start of the document, and its original file was not kept. Upload the file again to index all of it.";
  }
  return null;
}

// ── Embedding with retry ─────────────────────────────────────────────────────

/** A failure no retry can fix: the provider is not set up or is switched off. */
export function isPermanentEmbeddingError(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === "disabled" || code === "unknown_family" || code === "dimension_mismatch") return true;
  const msg = String((err as { message?: unknown })?.message ?? err ?? "");
  return /not configured|switched off|missing credentials|api key/i.test(msg);
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One batch, retried with exponential backoff unless the error is permanent. */
export async function embedBatchWithRetry(
  texts: string[],
  embed: (texts: string[]) => Promise<number[][]>,
  opts: RetryOptions = {},
): Promise<{ vectors: number[][]; attempts: number }> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      const vectors = await embed(texts);
      if (vectors.length !== texts.length) throw new Error(`The embedding model returned ${vectors.length} vectors for ${texts.length} texts.`);
      return { vectors, attempts: attempt };
    } catch (err) {
      if (attempt > retries || isPermanentEmbeddingError(err)) {
        (err as any).attempts = attempt;
        throw err;
      }
      await sleep(base * 2 ** (attempt - 1));
    }
  }
}

// ── Storing and embedding ────────────────────────────────────────────────────

export interface IndexDeps {
  /** Insert rows, returning their ids in the same order. */
  insertChunks: (rows: Array<{ knowledgeBaseId: string; sourceId: string; content: string; chunkIndex: number; metadata: Record<string, unknown>; tokenCount: number }>) => Promise<Array<{ id: string }>>;
  embed: (texts: string[]) => Promise<number[][]>;
  storeEmbedding: (chunkId: string, embedding: number[], text: string) => Promise<unknown>;
  /** Called after each stored window, for progress on the source row. */
  progress?: (report: IndexReport) => Promise<void> | void;
  sleep?: (ms: number) => Promise<void>;
}

export interface IndexOptions {
  /** Texts per embedding request. */
  embedBatch?: number;
  /** Rows per insert statement. */
  insertBatch?: number;
  retries?: number;
  baseDelayMs?: number;
  /** Extra metadata put on every chunk (a URL source's date, say). */
  chunkMetadata?: Record<string, unknown>;
}

export interface IndexReport {
  chunks: number;
  chunksStored: number;
  embedded: number;
  embeddingFailed: number;
  failedBatches: number;
  /** Why embedding stopped or failed, when it did. */
  embeddingError?: string;
  /** True once every chunk is stored and has a vector. */
  embeddingComplete: boolean;
}

/**
 * Store chunks in windows of `insertBatch`, embedding each window in requests
 * of `embedBatch` as it goes. A request that fails after its retries leaves
 * its chunks without vectors and the rest carry on; a permanent failure (no
 * provider configured) stops embedding but still stores every chunk.
 */
export async function storeAndEmbedChunks(
  target: { knowledgeBaseId: string; sourceId: string },
  chunks: PreparedChunk[],
  deps: IndexDeps,
  opts: IndexOptions = {},
): Promise<IndexReport> {
  const embedBatch = Math.max(1, opts.embedBatch ?? 64);
  const insertBatch = Math.max(embedBatch, opts.insertBatch ?? 512);
  const report: IndexReport = { chunks: chunks.length, chunksStored: 0, embedded: 0, embeddingFailed: 0, failedBatches: 0, embeddingComplete: false };
  let embeddingStopped = false;

  for (let start = 0; start < chunks.length; start += insertBatch) {
    const window = chunks.slice(start, start + insertBatch);
    const rows = window.map((c, i) => ({
      knowledgeBaseId: target.knowledgeBaseId,
      sourceId: target.sourceId,
      content: c.content,
      chunkIndex: start + i,
      metadata: opts.chunkMetadata ? { ...c.metadata, ...opts.chunkMetadata } : c.metadata,
      tokenCount: Math.ceil(c.content.length / 4),
    }));
    const ids = await deps.insertChunks(rows);
    if (ids.length !== rows.length) throw new Error(`Stored ${ids.length} of ${rows.length} chunks.`);
    report.chunksStored += rows.length;

    for (let b = 0; b < window.length; b += embedBatch) {
      const texts = window.slice(b, b + embedBatch).map((c) => c.content);
      if (embeddingStopped) {
        report.embeddingFailed += texts.length;
        continue;
      }
      try {
        const { vectors } = await embedBatchWithRetry(texts, deps.embed, { retries: opts.retries, baseDelayMs: opts.baseDelayMs, sleep: deps.sleep });
        for (let k = 0; k < texts.length; k++) {
          await deps.storeEmbedding(ids[b + k].id, vectors[k], texts[k]);
        }
        report.embedded += texts.length;
      } catch (err: any) {
        report.embeddingFailed += texts.length;
        report.failedBatches++;
        report.embeddingError = String(err?.message ?? err).slice(0, 300);
        if (isPermanentEmbeddingError(err)) embeddingStopped = true;
      }
    }
    await deps.progress?.(report);
  }

  report.embeddingComplete = report.embedded === report.chunks;
  return report;
}

// ── What the source row says ─────────────────────────────────────────────────

export interface SourceIndexingRecord {
  complete: boolean;
  /** Everything the document holds was read and chunked; only vectors may be missing. */
  readComplete: boolean;
  /** What, besides missing vectors, keeps the source partial. */
  readGaps?: string[];
  extraction?: ExtractionCoverage;
  sections?: number;
  sectionsWithoutText?: number;
  chunks: number;
  embedded: number;
  embeddingFailed: number;
  embeddingError?: string;
  /** Whether the original file was read, a page fetched, or only stored text was chunked. */
  from: "original_file" | "fetched_page" | "stored_text";
  summary: string;
  finishedAt: string;
}

export function embeddingGapMessage(failed: number, total: number, error?: string): string {
  return `${failed} of ${total} passages have no vector, so meaning-based search cannot find them ` +
    `(exact and keyword lookup still can)${error ? `: ${error}` : ""}. Use "Generate embeddings" to retry.`;
}

/**
 * A source's status after "Generate embeddings" filled in some of its missing
 * vectors: "processed" once none are missing and nothing else was, otherwise
 * still "partial" with the new counts.
 */
export function settleAfterEmbedding(record: SourceIndexingRecord, stillMissing: number, error?: string): { status: "processed" | "partial"; errorMessage: string | null; record: SourceIndexingRecord } {
  const embedded = Math.max(0, record.chunks - stillMissing);
  const problems = [...(record.readGaps ?? [])];
  if (stillMissing > 0) problems.push(embeddingGapMessage(stillMissing, record.chunks, error));
  const complete = problems.length === 0;
  const { embeddingError: _previous, ...rest } = record;
  return {
    status: complete ? "processed" : "partial",
    errorMessage: complete ? null : problems.join(" "),
    record: {
      ...rest,
      complete,
      embedded,
      embeddingFailed: stillMissing,
      ...(stillMissing > 0 && error ? { embeddingError: error } : {}),
      summary: record.summary.replace(/\d+ embedded$/, `${embedded} embedded`),
    },
  };
}

/**
 * The status and record a source gets once indexing ends. "processed" only
 * when everything the document holds was read, chunked and embedded;
 * otherwise "partial", with what is missing said in words.
 */
export function describeIndexing(input: {
  extraction?: ExtractionCoverage;
  audit?: ChunkAudit;
  report: IndexReport;
  from: SourceIndexingRecord["from"];
  /** Anything else known to be missing, in words. */
  gaps?: string[];
}): { status: "processed" | "partial"; errorMessage: string | null; record: SourceIndexingRecord } {
  const { extraction, audit, report } = input;
  const problems: string[] = [...(input.gaps ?? [])];
  if (extraction && !extraction.complete) problems.push(extraction.omitted ?? "Part of the document could not be read.");
  if (audit && audit.unaccounted.length > 0) problems.push(`${audit.unaccounted.length} sections produced no searchable passage.`);
  const readGaps = [...problems];
  if (report.embeddingFailed > 0) problems.push(embeddingGapMessage(report.embeddingFailed, report.chunks, report.embeddingError));
  const complete = problems.length === 0;
  const unitWord = extraction ? `${extraction.unitsKept} ${extraction.unit}${extraction.unitsKept === 1 ? "" : "s"}` : null;
  const summary = [
    unitWord ? `Read ${unitWord}${extraction && !extraction.complete ? ` of ${extraction.unitsTotal}` : ""}` : "Read stored text",
    `${report.chunks} passages`,
    `${report.embedded} embedded`,
  ].join(" · ");
  return {
    status: complete ? "processed" : "partial",
    errorMessage: complete ? null : problems.join(" "),
    record: {
      complete,
      readComplete: readGaps.length === 0,
      ...(readGaps.length ? { readGaps } : {}),
      ...(extraction ? { extraction } : {}),
      ...(audit ? { sections: audit.sections, sectionsWithoutText: audit.emptySections } : {}),
      chunks: report.chunks,
      embedded: report.embedded,
      embeddingFailed: report.embeddingFailed,
      ...(report.embeddingError ? { embeddingError: report.embeddingError } : {}),
      from: input.from,
      summary,
      finishedAt: new Date().toISOString(),
    },
  };
}
