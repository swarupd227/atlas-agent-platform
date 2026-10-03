/**
 * Retrieved passages, labelled so a claim made from one can be traced back to it.
 *
 * Both retrieval paths used to hand the model bare passage text: the knowledge
 * base step joined `chunk.content` together, and an agent's own retrieval
 * prefixed the block with the base's UUID. The provenance was in hand either way
 * -- both queries select `source_id` and `chunk_index`, and the agent path even
 * recorded a `sourceDocId` per chunk -- and none of it reached the model. An
 * agent asked to cite could then only omit the citations or invent them, and an
 * invented citation naming a document that really exists is the hardest kind of
 * error to catch later, because it survives every check that only looks at form.
 *
 * So: one labelling, used by both paths, so the text the model reads and the
 * index a reviewer checks against can never describe different passages.
 */

/** A row as the retrieval queries return it. Field names vary by path, so both spellings are read. */
export interface RetrievedChunk {
  id?: string | null;
  content?: string | null;
  similarity?: number | null;
  source_id?: string | null;
  sourceId?: string | null;
  chunk_index?: number | null;
  chunkIndex?: number | null;
  source_name?: string | null;
  source_url?: string | null;
  metadata?: unknown;
}

/** One passage's origin, as a later step or a reviewer reads it. */
export interface CitedSource {
  /** The handle that appears beside the passage and in the citation: "S1". */
  label: string;
  sourceId: string;
  /** What a person would call the document. Falls back to the base's name, then the id. */
  title: string;
  url?: string;
  chunkIndex: number | null;
  chunkId?: string;
  /** Enough to recognise the passage, never the passage itself -- the index is meant to stay small. */
  excerpt: string;
}

const EXCERPT_CHARS = 180;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** A filename some ingestion paths leave on the chunk when the source row has no name. */
function metadataTitle(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const m = metadata as Record<string, unknown>;
  return text(m.fileName) || text(m.filename) || text(m.title) || text(m.sourceName);
}

export function excerptOf(content: unknown): string {
  const flat = text(content).replace(/\s+/g, " ");
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS)}…` : flat;
}

/**
 * The passages as the model should read them, and the index that says where each
 * came from.
 *
 * `startAt` continues the numbering across several knowledge bases in one step,
 * so a label means one passage for the whole step rather than one per base.
 */
export function citePassages(
  chunks: RetrievedChunk[],
  opts: { kbName?: string; startAt?: number } = {},
): { text: string; sources: CitedSource[] } {
  const fallbackTitle = text(opts.kbName);
  let n = opts.startAt ?? 1;
  const sources: CitedSource[] = [];
  const blocks: string[] = [];

  for (const chunk of chunks) {
    const sourceId = text(chunk.source_id) || text(chunk.sourceId);
    const title = text(chunk.source_name) || metadataTitle(chunk.metadata) || fallbackTitle || sourceId || "unnamed source";
    const chunkIndex = num(chunk.chunk_index) ?? num(chunk.chunkIndex);
    const label = `S${n++}`;
    const url = text(chunk.source_url);

    sources.push({
      label,
      sourceId,
      title,
      ...(url ? { url } : {}),
      chunkIndex,
      ...(text(chunk.id) ? { chunkId: text(chunk.id) } : {}),
      excerpt: excerptOf(chunk.content),
    });

    // The label leads the passage so it reads as that passage's name, and the
    // part after the separator is what a citation would show a person.
    const where = chunkIndex === null ? "" : ` · chunk ${chunkIndex}`;
    blocks.push(`[${label}] ${title}${where}${url ? ` · ${url}` : ""}\n${text(chunk.content)}`);
  }

  return { text: blocks.join("\n\n"), sources };
}

/**
 * The instruction that makes the labels worth adding.
 *
 * Labels a model is not told to use are decoration -- the same lesson as a tool
 * allow-list that nothing enforces. This is deliberately narrow: cite what is
 * listed, and say so when the passages do not answer the question, rather than
 * reaching for a source that is not there.
 */
export const CITATION_RULE =
  "Each passage above is labelled [S1], [S2] … with the document it came from. " +
  "When you state something drawn from a passage, cite its label. " +
  "Never cite a label that is not in the list above, and never name a document that is not listed: " +
  "if the passages do not answer part of the question, say that plainly instead.";
