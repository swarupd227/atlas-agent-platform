import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export async function searchKnowledgeBaseChunks(
  knowledgeBaseId: string,
  query: string,
  topK: number = 5,
  scoreThreshold: number = 0.3,
): Promise<Array<{ id: string; content: string; similarity: number; metadata: any }>> {
  const available = await ensurePgVector();

  if (!available) {
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
