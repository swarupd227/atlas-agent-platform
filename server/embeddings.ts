import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

let pgvectorAvailable = false;

export function isPgvectorAvailable(): boolean {
  return pgvectorAvailable;
}

export async function setupPgVector(): Promise<void> {
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
      const idxCheck = await db.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'knowledge_chunks' AND indexname = 'idx_knowledge_chunks_embedding'
      `);
      if (!idxCheck.rows || idxCheck.rows.length === 0) {
        await db.execute(sql`
          CREATE INDEX idx_knowledge_chunks_embedding
          ON knowledge_chunks USING hnsw (embedding vector_cosine_ops)
        `);
      }
    } catch (indexErr: any) {
      console.log("[pgvector] HNSW index creation skipped (not supported), falling back to no index:", indexErr.message);
    }
    pgvectorAvailable = true;
    console.log("[pgvector] Vector embeddings enabled successfully");
  } catch (err: any) {
    pgvectorAvailable = false;
    console.log("[pgvector] Vector extension not available, embedding features disabled:", err.message);
  }
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

export async function searchKnowledgeBaseChunks(
  knowledgeBaseId: string,
  query: string,
  topK: number = 5,
  scoreThreshold: number = 0.3,
): Promise<Array<{ id: string; content: string; similarity: number; metadata: any }>> {
  if (!pgvectorAvailable) {
    const fallback = await db.execute(sql`
      SELECT id, content, chunk_index, metadata, token_count, source_id, 0.5 as similarity
      FROM knowledge_chunks WHERE knowledge_base_id = ${knowledgeBaseId}
      ORDER BY created_at DESC LIMIT ${topK}
    `);
    return (fallback.rows || []) as any[];
  }

  const embeddings = await generateEmbeddings([query]);
  const queryEmbedding = embeddings[0];
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const results = await db.execute(sql`
    SELECT id, content, chunk_index, metadata, token_count, source_id,
           1 - (embedding <=> ${embeddingStr}::vector) as similarity
    FROM knowledge_chunks
    WHERE knowledge_base_id = ${knowledgeBaseId}
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> ${embeddingStr}::vector) > ${scoreThreshold}
    ORDER BY embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `);

  return (results.rows || []) as any[];
}
