import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { getAllowedKbSensitivityLevels, type RoleId } from "./permissions";

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

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }
  return allEmbeddings;
}

export async function storeChunkEmbedding(chunkId: string, embedding: number[]): Promise<boolean> {
  const available = await ensurePgVector();
  if (!available) return false;
  const embeddingStr = `[${embedding.join(",")}]`;
  await db.execute(
    sql`UPDATE knowledge_chunks SET embedding = ${embeddingStr}::vector WHERE id = ${chunkId}`
  );
  return true;
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
): Promise<Array<{ id: string; content: string; similarity: number; metadata: any }>> {
  const available = await ensurePgVector();
  const allowedLevels = getAllowedKbSensitivityLevels(callerRole);

  if (!available) {
    const fallback = await db.execute(sql`
      SELECT c.id, c.content, c.chunk_index, c.metadata, c.token_count, c.source_id, 0.5 as similarity
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
