import { Express, Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { insertKnowledgeBaseSchema, insertKnowledgeSourceSchema, insertAgentKnowledgeBaseSchema, knowledgeChunks } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import OpenAI from "openai";
import { generateEmbeddings } from "./embeddings";

type Params = { id: string; sourceId?: string; kbId?: string; agentId?: string; linkId?: string };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);
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
  return chunks;
}

async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv" || filename.endsWith(".md") || filename.endsWith(".txt") || filename.endsWith(".csv")) {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    const pdfModule = await import("pdf-parse");
    const pdfParse = pdfModule.default || pdfModule;
    const data = await (pdfParse as any)(buffer);
    return data.text;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || filename.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (mimeType === "application/json" || filename.endsWith(".json")) {
    const json = JSON.parse(buffer.toString("utf-8"));
    return JSON.stringify(json, null, 2);
  }
  return buffer.toString("utf-8");
}

async function fetchWebContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "NousAgent-KB/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, iframe, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text;
}

async function processSourceInBackground(sourceId: string, kbId: string) {
  try {
    const source = await storage.getKnowledgeSource(sourceId);
    const kb = await storage.getKnowledgeBase(kbId);
    if (!source || !kb) return;

    await storage.updateKnowledgeSource(sourceId, { status: "processing" });

    let text = source.content || "";

    if (source.sourceType === "url" && source.url) {
      text = await fetchWebContent(source.url);
      await storage.updateKnowledgeSource(sourceId, { content: text });
    }

    if (!text || text.trim().length === 0) {
      await storage.updateKnowledgeSource(sourceId, { status: "error", errorMessage: "No text content extracted" });
      return;
    }

    const chunks = chunkText(text, kb.chunkSize, kb.chunkOverlap);
    const embeddings = await generateEmbeddings(chunks);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = await storage.createKnowledgeChunk({
        knowledgeBaseId: kbId,
        sourceId,
        content: chunks[i],
        chunkIndex: i,
        metadata: {},
        tokenCount: Math.ceil(chunks[i].length / 4),
      });

      const embeddingStr = `[${embeddings[i].join(",")}]`;
      await db.execute(
        sql`UPDATE knowledge_chunks SET embedding = ${embeddingStr}::vector WHERE id = ${chunk.id}`
      );
    }

    await storage.updateKnowledgeSource(sourceId, {
      status: "processed",
      chunkCount: chunks.length,
      processedAt: new Date(),
    });

    const allSources = await storage.getKnowledgeSources(kbId);
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    await storage.updateKnowledgeBase(kbId, {
      totalSources: allSources.length,
      totalChunks,
    });
  } catch (error: any) {
    console.error(`Error processing source ${sourceId}:`, error);
    await storage.updateKnowledgeSource(sourceId, {
      status: "error",
      errorMessage: error.message || "Processing failed",
    });
  }
}

export function registerKnowledgeBaseRoutes(app: Express) {
  app.get("/api/knowledge-bases", async (_req, res) => {
    const kbs = await storage.getKnowledgeBases();
    res.json(kbs);
  });

  app.get("/api/knowledge-bases/:id", async (req, res) => {
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
    res.json(kb);
  });

  app.post("/api/knowledge-bases", async (req, res) => {
    try {
      const data = insertKnowledgeBaseSchema.parse(req.body);
      const kb = await storage.createKnowledgeBase(data);
      res.status(201).json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/knowledge-bases/:id", async (req, res) => {
    const kb = await storage.updateKnowledgeBase(req.params.id, req.body);
    if (!kb) return res.status(404).json({ message: "Not found" });
    res.json(kb);
  });

  app.delete("/api/knowledge-bases/:id", async (req, res) => {
    const success = await storage.deleteKnowledgeBase(req.params.id);
    if (!success) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/sources", async (req, res) => {
    const sources = await storage.getKnowledgeSources(req.params.id);
    res.json(sources);
  });

  app.post("/api/knowledge-bases/:id/sources/upload", upload.single("file"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file provided" });

      const text = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id,
        name: file.originalname,
        sourceType: "document",
        status: "pending",
        content: text,
        metadata: { originalName: file.originalname },
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      const allSources = await storage.getKnowledgeSources(req.params.id);
      await storage.updateKnowledgeBase(req.params.id, { totalSources: allSources.length });

      processSourceInBackground(source.id, req.params.id);
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/url", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { url, name } = req.body;
      if (!url) return res.status(400).json({ message: "URL is required" });

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id,
        name: name || url,
        sourceType: "url",
        status: "pending",
        url,
        metadata: { url },
      });

      const allSources = await storage.getKnowledgeSources(req.params.id);
      await storage.updateKnowledgeBase(req.params.id, { totalSources: allSources.length });

      processSourceInBackground(source.id, req.params.id);
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/text", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { title, content } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id,
        name: title || "Manual Entry",
        sourceType: "text",
        status: "pending",
        content,
        metadata: {},
      });

      const allSources = await storage.getKnowledgeSources(req.params.id);
      await storage.updateKnowledgeBase(req.params.id, { totalSources: allSources.length });

      processSourceInBackground(source.id, req.params.id);
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/structured", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { name, data, fieldMapping } = req.body;
      if (!data) return res.status(400).json({ message: "Data is required" });

      const rows = Array.isArray(data) ? data : [data];
      const textParts = rows.map((row: any) => {
        if (fieldMapping) {
          return Object.entries(fieldMapping)
            .map(([key, label]) => `${label}: ${row[key] ?? ""}`)
            .join("\n");
        }
        return Object.entries(row).map(([k, v]) => `${k}: ${v}`).join("\n");
      });
      const combinedText = textParts.join("\n\n---\n\n");

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id,
        name: name || "Structured Data Import",
        sourceType: "structured",
        status: "pending",
        content: combinedText,
        metadata: { rowCount: rows.length, fieldMapping },
      });

      const allSources = await storage.getKnowledgeSources(req.params.id);
      await storage.updateKnowledgeBase(req.params.id, { totalSources: allSources.length });

      processSourceInBackground(source.id, req.params.id);
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/:sourceId/reprocess", async (req, res) => {
    try {
      const source = await storage.getKnowledgeSource(req.params.sourceId);
      if (!source) return res.status(404).json({ message: "Source not found" });

      await storage.deleteKnowledgeChunksBySource(req.params.sourceId);
      await storage.updateKnowledgeSource(req.params.sourceId, { status: "pending", chunkCount: 0, errorMessage: null });

      processSourceInBackground(req.params.sourceId, req.params.id);
      res.json({ message: "Reprocessing started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/knowledge-bases/:kbId/sources/:sourceId", async (req, res) => {
    const success = await storage.deleteKnowledgeSource(req.params.sourceId);
    if (!success) return res.status(404).json({ message: "Not found" });

    const allSources = await storage.getKnowledgeSources(req.params.kbId);
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    await storage.updateKnowledgeBase(req.params.kbId, {
      totalSources: allSources.length,
      totalChunks,
    });

    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/chunks", async (req, res) => {
    const chunks = await storage.getKnowledgeChunks(req.params.id);
    res.json(chunks);
  });

  app.post("/api/knowledge-bases/:id/search", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { query, topK = 5, scoreThreshold = 0.5 } = req.body;
      if (!query) return res.status(400).json({ message: "Query is required" });

      const embeddings = await generateEmbeddings([query]);
      const queryEmbedding = embeddings[0];
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      const results = await db.execute(sql`
        SELECT id, content, chunk_index, metadata, token_count, source_id,
               1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM knowledge_chunks
        WHERE knowledge_base_id = ${req.params.id}
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${embeddingStr}::vector) > ${scoreThreshold}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${topK}
      `);

      res.json(results.rows || []);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/agents/:agentId/knowledge-bases", async (req, res) => {
    const links = await storage.getAgentKnowledgeBases(req.params.agentId);
    const kbIds = links.map((l) => l.knowledgeBaseId);
    const allKbs = await storage.getKnowledgeBases();
    const linkedKbs = allKbs.filter((kb) => kbIds.includes(kb.id));
    res.json({ links, knowledgeBases: linkedKbs });
  });

  app.post("/api/agents/:agentId/knowledge-bases", async (req, res) => {
    try {
      const data = insertAgentKnowledgeBaseSchema.parse({
        ...req.body,
        agentId: req.params.agentId,
      });
      const link = await storage.createAgentKnowledgeBase(data);
      res.status(201).json(link);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/agents/:agentId/knowledge-bases/:linkId", async (req, res) => {
    const success = await storage.deleteAgentKnowledgeBase(req.params.linkId);
    if (!success) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/agents", async (req, res) => {
    const links = await storage.getKnowledgeBaseAgents(req.params.id);
    res.json(links);
  });

  app.post("/api/knowledge-bases/:id/query", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { question, topK = 5 } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });

      const embeddings = await generateEmbeddings([question]);
      const queryEmbedding = embeddings[0];
      const embeddingStr = `[${queryEmbedding.join(",")}]`;

      const results = await db.execute(sql`
        SELECT content, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM knowledge_chunks
        WHERE knowledge_base_id = ${req.params.id}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${topK}
      `);

      const context = (results.rows || []).map((r: any) => r.content).join("\n\n");

      const openai = new OpenAI();
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `You are a helpful assistant. Answer the question based ONLY on the following context. If the context doesn't contain relevant information, say so.\n\nContext:\n${context}` },
          { role: "user", content: question },
        ],
        max_tokens: 1000,
      });

      res.json({
        answer: completion.choices[0]?.message?.content || "No answer generated",
        sources: results.rows || [],
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
