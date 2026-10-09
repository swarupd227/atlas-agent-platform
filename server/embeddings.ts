import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { getAllowedKbSensitivityLevels, type RoleId } from "./permissions";
import { createHash } from "crypto";

/**
 * The model every vector in knowledge_chunks is computed with.
 *
 * Exported and stamped on each chunk rather than left as a literal inside the
 * request: a reader of a chunk could not otherwise tell which model produced
 * its vector, or whether two vectors sitting beside each other are even
 * comparable. Changing this constant without re-embedding leaves rows whose
 * stamp disagrees with the code -- which is the point. That disagreement is
 * now visible instead of silent.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

const embeddingsApiKey = process.env.OPENAI_API_KEY;
const openai = embeddingsApiKey
  ? new OpenAI({ apiKey: embeddingsApiKey })
  : null;

if (!openai) {
  console.warn(
    "[embeddings] OPENAI_API_KEY not set; vector embeddings disabled. " +
      "Set OPENAI_API_KEY to enable semantic search.",
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

export const MAX_EMBEDDING_INPUT_CHARS = 20_000;

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!openai) {
    throw new Error(
      "OPENAI_API_KEY not configured — embeddings unavailable. Set OPENAI_API_KEY to enable semantic search.",
    );
  }

  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    // The model rejects any input over 8,192 tokens, and one such input fails
    // the whole batch. Chunks are split well below that (splitOversizedChunk in
    // kb-routes.ts); this cap only protects a batch from an older oversized chunk
    // or an unusually long query. 20,000 characters stays under the limit even
    // for dense text such as CSV or code.
    const batch = texts.slice(i, i + batchSize).map((t) => (t.length > MAX_EMBEDDING_INPUT_CHARS ? t.slice(0, MAX_EMBEDDING_INPUT_CHARS) : t));
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }
  return allEmbeddings;
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
 * Store a vector together with what it represents.
 *
 * `text` is required, not optional, and that is the design: a caller cannot
 * store a vector without saying what it was computed from. Stamping at each
 * call site instead is the shape that let `?? 0` reach fourteen readers of a
 * pass rate -- one place that cannot be forgotten is the fix.
 */
export async function storeChunkEmbedding(chunkId: string, embedding: number[], text: string): Promise<boolean> {
  const available = await ensurePgVector();
  if (!available) return false;
  const embeddingStr = `[${embedding.join(",")}]`;
  const hash = chunkContentHash(text);
  await db.execute(
    sql`UPDATE knowledge_chunks
           SET embedding = ${embeddingStr}::vector,
               content_hash = ${hash},
               embedding_model = ${EMBEDDING_MODEL},
               embedded_at = NOW()
         WHERE id = ${chunkId}`
  );
  return true;
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
): ChunkVectorState {
  if (!hasVector) return "never_embedded";
  // Stored before these columns existed. NOT "current": there is no evidence
  // either way, and answering "current" would be the fabrication this change
  // exists to stop.
  if (!chunk.contentHash) return "unattributed";
  if (chunk.contentHash !== chunkContentHash(chunk.content)) return "stale";
  if (chunk.embeddingModel && chunk.embeddingModel !== EMBEDDING_MODEL) return "model_changed";
  return "current";
}

/**
 * Permissions-aware retrieval: joins each chunk to its source's
 * sensitivityLevel and excludes anything the caller's role isn't allowed to
 * see (server/permissions.ts's canAccessKbSensitivity / R0-R1-R2 grouping).
 * Filtering happens in the WHERE clause, before LIMIT — post-filtering after
 * topK would silently under-fill the result set whenever a blocked chunk
 * would otherwise have ranked in the top K.
 *
 * callerRole is optional for backward compatibility with any caller that
 * hasn't been updated to pass it yet, but omitting it means "no requester
 * identity" and falls back to getAllowedKbSensitivityLevels(undefined) —
 * the safe "internal and below" default, never full access.
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
  const available = await ensurePgVector();
  const allowedLevels = getAllowedKbSensitivityLevels(callerRole);

  if (!available) {
    // pgvector is unavailable, so this is a recency-ordered fallback with no
    // actual vector comparison behind it. similarity is explicitly NULL here
    // (not a fake constant like 0.5) so callers/UIs don't mistake a filler
    // value for a real relevance score.
    const fallback = await db.execute(sql`
      SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id,
             s.name as source_name, s.url as source_url, NULL::real as similarity
      FROM knowledge_chunks c
      LEFT JOIN knowledge_sources s ON s.id = c.source_id
      WHERE c.knowledge_base_id = ${knowledgeBaseId}
        AND COALESCE(s.sensitivity_level, 'public') IN (${sql.join(allowedLevels.map(l => sql`${l}`), sql`, `)})
      ORDER BY c.created_at DESC LIMIT ${topK}
    `);
    return (fallback.rows || []) as any[];
  }

  const embeddings = await generateEmbeddings([query]);
  const queryEmbedding = embeddings[0];
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

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
    LIMIT ${topK}
  `);

  return (results.rows || []) as any[];
}
