import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
