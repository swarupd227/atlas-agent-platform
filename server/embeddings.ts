import { db } from "./db";
import { sql } from "drizzle-orm";
import { getAllowedKbSensitivityLevels, type RoleId } from "./permissions";
import { createHash } from "crypto";
import { knowledgeLimits } from "./config";
import {
  MAX_EMBEDDING_INPUT_CHARS as BACKEND_MAX_INPUT_CHARS, OPENAI_EMBEDDING_MODEL, embedWith, embeddingAvailable, getActiveEmbedding, isOpenAiEmbeddingConfigured,
  pgVectorStore, vectorFacts, ensureVectorTable, type EmbeddingTarget,
} from "./embedding-backend";
import type { EmbeddingKind } from "./bedrock-client";

/**
 * The model every vector in knowledge_chunks.embedding is computed with (the legacy store, which is what the platform used from the
 * start). It is still what search uses until an administrator switches document search to another model on the Model Providers
 * page; see server/embedding-backend.ts for the active model and where the other models' vectors live.
 *
 * Exported and stamped on each chunk rather than left as a literal inside the request: a reader of a chunk could not otherwise
 * tell which model produced its vector, or whether two vectors sitting beside each other are even comparable. Changing this
 * constant without re-embedding leaves rows whose stamp disagrees with the code -- which is the point. That disagreement is
 * now visible instead of silent.
 */
export const EMBEDDING_MODEL = OPENAI_EMBEDDING_MODEL;

if (!isOpenAiEmbeddingConfigured()) {
  console.warn(
    "[embeddings] OPENAI_API_KEY not set; OpenAI vector embeddings disabled (document search can use Amazon Bedrock instead, " +
      "if it is set up on the Model Providers page).",
  );
}

let pgvectorState: "unknown" | "available" | "unavailable" = "unknown";
let initPromise: Promise<void> | null = null;

export function isPgvectorAvailable(): boolean {
  return (pgvectorState as string) === "available";
}

export async function ensurePgVector(): Promise<boolean> {
  if (pgvectorState !== "unknown") return (pgvectorState as string) === "available";

  if (!initPromise) {
    initPromise = (async () => {
      try {
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
        const colCheck = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = 'knowledge_chunks' AND column_name = 'embedding'
        `);
        if (!colCheck.rows || colCheck.rows.length === 0) {
          await db.execute(sql`ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536)`);
        }
        try {
          await db.execute(sql`DROP INDEX IF EXISTS idx_knowledge_chunks_embedding`);
        } catch (indexErr: any) {
          console.log("[pgvector] Index cleanup skipped:", indexErr.message);
        }
        pgvectorState = "available";
        console.log("[pgvector] Vector embeddings enabled successfully");
      } catch (err: any) {
        pgvectorState = "unavailable";
        console.log("[pgvector] Vector extension not available, embedding features disabled:", err.message);
      }
    })();
  }
  await initPromise;
  return (pgvectorState as string) === "available";
}

export const MAX_EMBEDDING_INPUT_CHARS = BACKEND_MAX_INPUT_CHARS;

/**
 * Vectors for the given texts with the ACTIVE model (OpenAI until an administrator switches to another). `kind` matters only to
 * models that treat a stored passage and a question differently (Cohere): pass "query" for search text.
 */
export async function generateEmbeddings(texts: string[], kind: EmbeddingKind = "document"): Promise<number[][]> {
  // The model rejects any input over its token limit, and one such input fails the whole batch. Chunks are split well below that
  // (splitOversizedChunk in kb-routes.ts); the cap in embedWith only protects a batch from an older oversized chunk or an
  // unusually long query. 20,000 characters stays under the limit even for dense text such as CSV or code.
  return embedWith(await getActiveEmbedding(), texts, kind);
}

/** Whether the active model can be called at all (OpenAI: the key is set; Bedrock: switched on with a region and a model). */
export { embeddingAvailable };

/** What a person reads next to a vector or a retrieval: the active model's name. */
export async function activeEmbeddingLabel(): Promise<string> {
  const t = await getActiveEmbedding();
  return t.provider === "openai" ? t.modelId : t.modelKey;
}

/**
 * SHA-256 of the exact text a vector was computed from.
 *
 * Of the CHUNK, not the source. A source-level hash cannot distinguish "chunk 7
 * changed" from "chunks 1-6 are fine", which is precisely what a partial
 * reprocess leaves behind. Hashed after the same truncation generateEmbeddings
 * applies, so the hash describes what the model actually saw rather than what
 * we intended it to see.
 */
export function chunkContentHash(text: string): string {
  const seen = text.length > MAX_EMBEDDING_INPUT_CHARS ? text.slice(0, MAX_EMBEDDING_INPUT_CHARS) : text;
  return createHash("sha256").update(seen, "utf8").digest("hex");
}

/**
 * Store a vector together with what it represents, in the active model's store.
 *
 * `text` is required, not optional, and that is the design: a caller cannot
 * store a vector without saying what it was computed from. Stamping at each
 * call site instead is the shape that let `?? 0` reach fourteen readers of a
 * pass rate -- one place that cannot be forgotten is the fix.
 */
export async function storeChunkEmbedding(chunkId: string, embedding: number[], text: string): Promise<boolean> {
  const available = await ensurePgVector();
  if (!available) return false;
  await pgVectorStore.save(await getActiveEmbedding(), chunkId, embedding, text);
  return true;
}

/** What each chunk of a base has in the active model's store: whether there is a vector, and what it was made from and with. */
export async function embeddingFacts(kbId: string): Promise<{ target: EmbeddingTarget; facts: Awaited<ReturnType<typeof vectorFacts>> }> {
  const target = await getActiveEmbedding();
  return { target, facts: await vectorFacts(kbId, target) };
}

/**
 * What a chunk's vector actually is, as a fact a reader can act on.
 *
 * These states were indistinguishable before: no vector at all, a vector that
 * matches the current text, and a vector computed from text that has since
 * changed. The 2026-09-19 embedding wipe is still recorded as "cause unknown"
 * largely because they rendered identically.
 */
export type ChunkVectorState = "current" | "stale" | "model_changed" | "never_embedded" | "unattributed";

export function chunkVectorState(
  chunk: { content: string; contentHash?: string | null; embeddingModel?: string | null },
  hasVector: boolean,
  /** What a vector's own record should say it was made with: the active model's stamp. */
  activeStamp: string = EMBEDDING_MODEL,
): ChunkVectorState {
  if (!hasVector) return "never_embedded";
  // Stored before these columns existed. NOT "current": there is no evidence
  // either way, and answering "current" would be the fabrication this change
  // exists to stop.
  if (!chunk.contentHash) return "unattributed";
  if (chunk.contentHash !== chunkContentHash(chunk.content)) return "stale";
  if (chunk.embeddingModel && chunk.embeddingModel !== activeStamp) return "model_changed";
  return "current";
}

/**
 * Strings to compare with a chunk's stored key (metadata.key, or productId on
 * chunks indexed before it was generalized). The whole query is one key, so a
 * search that is exactly an identifier matches. Tokens of three or more
 * characters are the others, so a question that contains an id still matches
 * and a descriptive sentence does not match on short words.
 */
export function productIdLookupKeys(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const keys = new Set<string>();
  keys.add(trimmed);
  for (const raw of trimmed.split(/[\s,;]+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (token.length >= 3) keys.add(token);
  }
  return [...keys];
}

/**
 * Tokens of a query that look like identifiers -- a part number, an invoice
 * or clause reference, a code -- rather than words: they contain a digit, or
 * join letters with "-", "_", "." or "/". These are looked for verbatim in
 * every chunk's text, so an identifier inside a PDF page or a DOCX paragraph
 * is found exactly, not only one stored as a spreadsheet row's key.
 */
export function identifierTokens(query: string): string[] {
  const out = new Set<string>();
  for (const raw of query.trim().split(/[\s,;()"'?!]+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (token.length < 3 || token.length > 64) continue;
    if (/\d/.test(token) || /[A-Za-z0-9][-_./][A-Za-z0-9]/.test(token)) out.add(token);
  }
  return [...out].slice(0, 8);
}

const LEXICAL_STOPWORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it its me my of on or our that the this to was we what when where which who why will with you your".split(" "),
);

/** Query words for a full-text OR search: lowercase letters and digits only. */
export function lexicalTerms(query: string): string[] {
  const out = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || LEXICAL_STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return [...out].slice(0, 32);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

type RetrievedChunk = {
  id: string;
  content: string;
  similarity: number | null;
  metadata: any;
  source_id: string | null;
  chunk_index: number | null;
  source_name: string | null;
  source_url: string | null;
};

function clampTopK(topK: number): number {
  if (!Number.isFinite(topK) || topK < 1) return 1;
  return Math.min(knowledgeLimits.retrievalMaxTopK, Math.floor(topK));
}

function mergeChunkHits(exact: RetrievedChunk[], semantic: RetrievedChunk[], limit: number): RetrievedChunk[] {
  const seen = new Set<string>();
  const out: RetrievedChunk[] = [];
  const cap = clampTopK(limit);
  for (const row of [...exact, ...semantic]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Exact matches, whatever the vector score: chunks whose stored key (a row's
 * identifier column; productId on chunks indexed before) is the query or a
 * token in it, then chunks whose text contains an identifier-like token of the
 * query as a whole word. Key matches come first.
 */
async function lookupChunksByProductId(
  knowledgeBaseId: string,
  query: string,
  allowedLevels: string[],
  topK: number = 5,
): Promise<RetrievedChunk[]> {
  const cap = clampTopK(topK);
  const keys = productIdLookupKeys(query).map((key) => key.toLowerCase());
  if (keys.length === 0) return [];
  const keyList = sql.join(keys.map((key) => sql`${key}`), sql`, `);
  const found = await db.execute(sql`
    SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
           s.name as source_name, s.url as source_url, NULL::real as similarity
    FROM knowledge_chunks c
    LEFT JOIN knowledge_sources s ON s.id = c.source_id
    WHERE c.knowledge_base_id = ${knowledgeBaseId}
      AND (lower(c.metadata->>'productId') IN (${keyList}) OR lower(c.metadata->>'key') IN (${keyList}))
      AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
    LIMIT ${cap}
  `);
  const byKey = (found.rows || []) as RetrievedChunk[];

  const ids = identifierTokens(query);
  if (ids.length === 0) return byKey;
  // Whole-word, case-insensitive: SKU-1 must not match SKU-10.
  const patterns = ids.map((t) => `(^|[^A-Za-z0-9])${escapeRegex(t)}([^A-Za-z0-9]|$)`);
  const inText = await db.execute(sql`
    SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
           s.name as source_name, s.url as source_url, NULL::real as similarity
    FROM knowledge_chunks c
    LEFT JOIN knowledge_sources s ON s.id = c.source_id
    WHERE c.knowledge_base_id = ${knowledgeBaseId}
      AND (${sql.join(patterns.map((p) => sql`c.content ~* ${p}`), sql` OR `)})
      AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
    ORDER BY c.source_id, c.chunk_index
    LIMIT ${cap}
  `);
  return mergeChunkHits(byKey, (inText.rows || []) as RetrievedChunk[], cap);
}

/**
 * Ranked full-text search (any query word, ranked by how many and how close).
 * `withoutVectorFor` restricts it to chunks with no vector for that model, so
 * it fills exactly the gap a failed embedding batch left and does not change
 * results for a fully embedded base. Without pgvector it covers every chunk.
 */
async function lexicalSearch(
  knowledgeBaseId: string,
  query: string,
  allowedLevels: string[],
  topK: number,
  withoutVectorFor?: { store: "legacy" | "vectors"; modelKey: string },
): Promise<RetrievedChunk[]> {
  const cap = clampTopK(topK);
  const terms = lexicalTerms(query);
  if (terms.length === 0) return [];
  const tsq = terms.join(" | ");
  const gap = !withoutVectorFor
    ? sql``
    : withoutVectorFor.store === "vectors"
      ? sql`AND NOT EXISTS (SELECT 1 FROM knowledge_chunk_vectors v WHERE v.chunk_id = c.id AND v.model_key = ${withoutVectorFor.modelKey})`
      : sql`AND c.embedding IS NULL`;
  const rows = await db.execute(sql`
    SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
           s.name as source_name, s.url as source_url, NULL::real as similarity
    FROM knowledge_chunks c
    LEFT JOIN knowledge_sources s ON s.id = c.source_id
    WHERE c.knowledge_base_id = ${knowledgeBaseId}
      AND to_tsvector('simple', c.content) @@ to_tsquery('simple', ${tsq})
      ${gap}
      AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
    ORDER BY ts_rank_cd(to_tsvector('simple', c.content), to_tsquery('simple', ${tsq})) DESC
    LIMIT ${cap}
  `);
  return (rows.rows || []) as RetrievedChunk[];
}

/** A search request the API should refuse before it reaches retrieval. */
export class RetrievalQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalQueryError";
  }
}

/**
 * Query length, topK and scoreThreshold at an HTTP boundary. topK is clamped
 * again inside searchKnowledgeBaseChunks for callers that do not come through here.
 */
export function normalizeRetrievalRequest(
  input: { query: unknown; topK?: unknown; scoreThreshold?: unknown },
  defaults: { topK?: number; scoreThreshold?: number } = {},
): { query: string; topK: number; scoreThreshold: number } {
  if (typeof input.query !== "string" || !input.query.trim()) {
    throw new RetrievalQueryError("Query is required");
  }
  const query = input.query.trim();
  if (query.length > knowledgeLimits.retrievalMaxQueryChars) {
    throw new RetrievalQueryError(`Query is too long. The limit is ${knowledgeLimits.retrievalMaxQueryChars} characters.`);
  }
  let topK = defaults.topK ?? 5;
  if (input.topK !== undefined && input.topK !== null && input.topK !== "") {
    const n = Number(input.topK);
    if (!Number.isInteger(n) || n < 1 || n > knowledgeLimits.retrievalMaxTopK) {
      throw new RetrievalQueryError(`topK must be an integer from 1 to ${knowledgeLimits.retrievalMaxTopK}.`);
    }
    topK = n;
  }
  let scoreThreshold = defaults.scoreThreshold ?? 0.3;
  if (input.scoreThreshold !== undefined && input.scoreThreshold !== null && input.scoreThreshold !== "") {
    const n = Number(input.scoreThreshold);
    if (!Number.isFinite(n) || n < 0 || n >= 1) {
      throw new RetrievalQueryError("scoreThreshold must be a number from 0 up to, but not including, 1.");
    }
    scoreThreshold = n;
  }
  return { query, topK: clampTopK(topK), scoreThreshold };
}

/**
 * Permissions-aware retrieval: joins each chunk to its source's
 * sensitivityLevel and excludes anything the caller's role isn't allowed to
 * see (server/permissions.ts's canAccessKbSensitivity / R0-R1-R2 grouping).
 * Filtering happens in the WHERE clause, before LIMIT — post-filtering after
 * topK would silently under-fill the result set whenever a blocked chunk
 * would otherwise have ranked in the top K.
 *
 * A product id stored on a chunk is returned even when its vector similarity
 * is below scoreThreshold. Descriptive questions still use that semantic
 * search; the id lookup adds matches, it does not replace it.
 *
 * callerRole is optional for backward compatibility with any caller that
 * hasn't been updated to pass it yet, but omitting it means "no requester
 * identity" and falls back to getAllowedKbSensitivityLevels(undefined) —
 * the safe "internal and below" default, never full access.
 *
 * The query is embedded with the ACTIVE model and compared only with vectors of that same model.
 */
export async function searchKnowledgeBaseChunks(
  knowledgeBaseId: string,
  query: string,
  topK: number = 5,
  scoreThreshold: number = 0.3,
  callerRole?: RoleId | null,
): Promise<Array<{
  id: string;
  content: string;
  similarity: number | null;
  metadata: any;
  /** Which document this passage came from, so a claim made from it can cite it. */
  source_id: string | null;
  chunk_index: number | null;
  /** The source row's own name and link, for a citation a person can follow. */
  source_name: string | null;
  source_url: string | null;
}>> {
  const cap = clampTopK(topK);
  // HTTP routes reject an over-long query. Agent, workspace, worker and DAG
  // callers pass a prompt or a user message, which can be longer than a search
  // box, so the service keeps the leading characters instead of failing the run.
  const q = query.length > knowledgeLimits.retrievalMaxQueryChars ? query.slice(0, knowledgeLimits.retrievalMaxQueryChars) : query;
  const available = await ensurePgVector();
  const allowedLevels = getAllowedKbSensitivityLevels(callerRole);
  const exact = await lookupChunksByProductId(knowledgeBaseId, q, allowedLevels, cap);

  if (!available) {
    // pgvector is unavailable: keyword search instead of vector comparison.
    // similarity is explicitly NULL (not a fake constant like 0.5) so
    // callers/UIs don't mistake a filler value for a real relevance score.
    let lexical: RetrievedChunk[] = [];
    try {
      lexical = await lexicalSearch(knowledgeBaseId, q, allowedLevels, cap);
    } catch (err) {
      console.warn("[embeddings] keyword search failed:", err instanceof Error ? err.message : err);
    }
    if (exact.length > 0 || lexical.length > 0) return mergeChunkHits(exact, lexical, cap);
    // Nothing matched any word: the most recent chunks, as before.
    const fallback = await db.execute(sql`
      SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
             s.name as source_name, s.url as source_url, NULL::real as similarity
      FROM knowledge_chunks c
      LEFT JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.knowledge_base_id = ${knowledgeBaseId}
        AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
      ORDER BY c.created_at DESC LIMIT ${cap}
    `);
    return mergeChunkHits(exact, (fallback.rows || []) as RetrievedChunk[], cap);
  }

  let semantic: RetrievedChunk[] = [];
  let active: Awaited<ReturnType<typeof getActiveEmbedding>> | undefined;
  try {
    active = await getActiveEmbedding();
    const embeddings = await embedWith(active, [q], "query");
    const queryEmbedding = embeddings[0];
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    if (active.store === "vectors") {
      await ensureVectorTable();
      const results = await db.execute(sql`
        SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
               s.name as source_name, s.url as source_url,
               1 - (v.embedding <=> ${embeddingStr}::vector) as similarity
        FROM knowledge_chunks c
        JOIN knowledge_chunk_vectors v ON v.chunk_id = c.id AND v.model_key = ${active.modelKey}
        LEFT JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.knowledge_base_id = ${knowledgeBaseId}
          AND 1 - (v.embedding <=> ${embeddingStr}::vector) > ${scoreThreshold}
          AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
        ORDER BY v.embedding <=> ${embeddingStr}::vector
        LIMIT ${cap}
      `);
      semantic = (results.rows || []) as RetrievedChunk[];
    } else {
      const results = await db.execute(sql`
        SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
               s.name as source_name, s.url as source_url,
               1 - (c.embedding <=> ${embeddingStr}::vector) as similarity
        FROM knowledge_chunks c
        LEFT JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.knowledge_base_id = ${knowledgeBaseId}
          AND c.embedding IS NOT NULL
          AND 1 - (c.embedding <=> ${embeddingStr}::vector) > ${scoreThreshold}
          AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
        ORDER BY c.embedding <=> ${embeddingStr}::vector
        LIMIT ${cap}
      `);
      semantic = (results.rows || []) as RetrievedChunk[];
    }
  } catch (err) {
    // The embedding provider is down or misconfigured. Keyword search still
    // answers; an error is returned only when that search fails too.
    console.warn(
      "[embeddings] semantic search failed; trying keyword search:",
      err instanceof Error ? err.message : err,
    );
    try {
      const lexical = await lexicalSearch(knowledgeBaseId, q, allowedLevels, cap);
      return mergeChunkHits(exact, lexical, cap);
    } catch (fallbackErr) {
      console.warn(
        "[embeddings] keyword search failed:",
        fallbackErr instanceof Error ? fallbackErr.message : fallbackErr,
      );
      throw fallbackErr;
    }
  }

  // Chunks a failed embedding batch left without a vector are invisible to
  // the comparison above; keyword search is how they stay reachable.
  let unembedded: RetrievedChunk[] = [];
  if (active) {
    try {
      unembedded = await lexicalSearch(knowledgeBaseId, q, allowedLevels, cap, {
        store: active.store === "vectors" ? "vectors" : "legacy",
        modelKey: active.modelKey,
      });
    } catch (err) {
      console.warn("[embeddings] keyword search over unembedded chunks failed:", err instanceof Error ? err.message : err);
    }
  }

  return mergeChunkHits(exact, mergeChunkHits(semantic, unembedded, cap), cap);
}
