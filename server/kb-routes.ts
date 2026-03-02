import { Express, Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { insertKnowledgeBaseSchema, insertKnowledgeSourceSchema, insertAgentKnowledgeBaseSchema, knowledgeChunks, knowledgeSources } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import OpenAI from "openai";
import { generateEmbeddings, storeChunkEmbedding } from "./embeddings";

interface OntologyAlignmentResult {
  score: number;
  canonicalTermsFound: string[];
  nonStandardTerms: Array<{ term: string; suggestedTerm: string }>;
  totalTermsChecked: number;
}

async function computeOntologyAlignment(text: string, industryId: string): Promise<OntologyAlignmentResult> {
  const concepts = await storage.getOntologyConcepts(industryId);
  const allConcepts = concepts.length > 0 ? concepts : await storage.getAllOntologyConcepts();

  if (allConcepts.length === 0) {
    return { score: 100, canonicalTermsFound: [], nonStandardTerms: [], totalTermsChecked: 0 };
  }

  const textLower = text.toLowerCase();
  const canonicalTermsFound: string[] = [];
  const nonStandardTerms: Array<{ term: string; suggestedTerm: string }> = [];

  for (const concept of allConcepts.slice(0, 50)) {
    const labelLower = concept.label.toLowerCase();
    const labelWords = labelLower.split(/[\s_-]+/).filter((w: string) => w.length > 2);
    const labelFound = textLower.includes(labelLower) ||
      (labelWords.length > 1 && labelWords.every((w: string) => textLower.includes(w)));

    if (labelFound) {
      canonicalTermsFound.push(concept.label);
    }

    if (concept.synonyms && concept.synonyms.length > 0) {
      for (const syn of concept.synonyms) {
        const synLower = syn.toLowerCase();
        if (textLower.includes(synLower) && !labelFound) {
          nonStandardTerms.push({ term: syn, suggestedTerm: concept.label });
        }
      }
    }
  }

  const totalMentions = canonicalTermsFound.length + nonStandardTerms.length;
  const score = totalMentions > 0
    ? Math.round((canonicalTermsFound.length / totalMentions) * 100)
    : 100;

  return {
    score,
    canonicalTermsFound,
    nonStandardTerms,
    totalTermsChecked: totalMentions,
  };
}

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
    let embeddings: number[][] | null = null;
    try {
      embeddings = await generateEmbeddings(chunks);
    } catch (embErr: any) {
      console.log("[kb] Embedding generation failed, storing chunks without embeddings:", embErr.message);
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = await storage.createKnowledgeChunk({
        knowledgeBaseId: kbId,
        sourceId,
        content: chunks[i],
        chunkIndex: i,
        metadata: {},
        tokenCount: Math.ceil(chunks[i].length / 4),
      });

      if (embeddings && embeddings[i]) {
        await storeChunkEmbedding(chunk.id, embeddings[i]);
      }
    }

    let ontologyMeta: any = {};
    try {
      const alignment = await computeOntologyAlignment(text, kb.industry);
      ontologyMeta = {
        ontologyAlignment: alignment.score,
        canonicalTermsFound: alignment.canonicalTermsFound,
        nonStandardTerms: alignment.nonStandardTerms.slice(0, 10),
        totalTermsChecked: alignment.totalTermsChecked,
      };
    } catch (err: any) {
      console.log(`[kb] Ontology alignment check failed for source ${sourceId}:`, err.message);
    }

    const existingMeta = (source.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, any> : {};
    await storage.updateKnowledgeSource(sourceId, {
      status: "processed",
      chunkCount: chunks.length,
      processedAt: new Date(),
      freshnessStatus: "fresh",
      lastFreshnessCheckAt: new Date(),
      metadata: { ...existingMeta, ...ontologyMeta },
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

  app.post("/api/knowledge-bases/:id/embed", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id);
      if (chunks.length === 0) return res.json({ total: 0, embedded: 0, message: "No chunks to embed" });

      const { ensurePgVector } = await import("./embeddings");
      const pgReady = await ensurePgVector();
      if (!pgReady) return res.status(500).json({ message: "Vector database not available" });

      const missingChunks: typeof chunks = [];
      for (const chunk of chunks) {
        const check = await db.execute(sql`SELECT embedding IS NOT NULL as has_emb FROM knowledge_chunks WHERE id = ${chunk.id}`);
        if (check.rows?.[0] && !(check.rows[0] as any).has_emb) {
          missingChunks.push(chunk);
        }
      }

      if (missingChunks.length === 0) return res.json({ total: chunks.length, embedded: 0, alreadyEmbedded: chunks.length, message: "All chunks already have embeddings" });

      const texts = missingChunks.map(c => c.content);
      const embeddings = await generateEmbeddings(texts);
      let embeddedCount = 0;
      for (let i = 0; i < missingChunks.length; i++) {
        if (embeddings[i]) {
          await storeChunkEmbedding(missingChunks[i].id, embeddings[i]);
          embeddedCount++;
        }
      }

      res.json({ total: chunks.length, embedded: embeddedCount, alreadyEmbedded: chunks.length - missingChunks.length, message: `Generated embeddings for ${embeddedCount} chunks` });
    } catch (error: any) {
      console.error("[kb] Embedding generation error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/embedding-status", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id);
      if (chunks.length === 0) return res.json({ total: 0, withEmbeddings: 0, withoutEmbeddings: 0 });

      try {
        const result = await db.execute(sql`
          SELECT COUNT(*) as total,
                 COUNT(embedding) as with_embeddings
          FROM knowledge_chunks WHERE knowledge_base_id = ${req.params.id}
        `);
        const row = result.rows?.[0] as any;
        const total = parseInt(row?.total || "0");
        const withEmb = parseInt(row?.with_embeddings || "0");
        res.json({ total, withEmbeddings: withEmb, withoutEmbeddings: total - withEmb });
      } catch {
        res.json({ total: chunks.length, withEmbeddings: 0, withoutEmbeddings: chunks.length });
      }
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

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      const results = await searchKnowledgeBaseChunks(req.params.id, query, topK, scoreThreshold);
      res.json(results);
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

  app.get("/api/knowledge-bases/:id/ontology-alignment", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id);
      const sourceAlignments = sources.map((source) => {
        const meta = (source.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, any> : {};
        return {
          sourceId: source.id,
          sourceName: source.name,
          status: source.status,
          ontologyAlignment: meta.ontologyAlignment ?? null,
          canonicalTermsFound: meta.canonicalTermsFound || [],
          nonStandardTerms: meta.nonStandardTerms || [],
          totalTermsChecked: meta.totalTermsChecked || 0,
        };
      });

      const scored = sourceAlignments.filter((s) => s.ontologyAlignment !== null);
      const overallAlignment = scored.length > 0
        ? Math.round(scored.reduce((sum, s) => sum + s.ontologyAlignment, 0) / scored.length)
        : null;

      res.json({
        knowledgeBaseId: req.params.id,
        industry: kb.industry,
        overallAlignment,
        totalSources: sources.length,
        scoredSources: scored.length,
        sources: sourceAlignments,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/ontology-coverage", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const concepts = await storage.getOntologyConcepts(kb.industry);
      const allConcepts = concepts.length > 0 ? concepts : await storage.getAllOntologyConcepts();

      if (allConcepts.length === 0) {
        return res.json({
          totalConcepts: 0,
          coveredConcepts: 0,
          uncoveredConcepts: 0,
          coveragePercent: 100,
          gaps: [],
          covered: [],
        });
      }

      const sources = await storage.getKnowledgeSources(req.params.id);
      const processedSources = sources.filter((s) => s.status === "processed");

      const gaps: Array<{ conceptId: string; label: string; category: string; description: string }> = [];
      const covered: Array<{ conceptId: string; label: string; category: string; sourceCount: number }> = [];

      for (const concept of allConcepts) {
        const labelLower = concept.label.toLowerCase();
        const synonyms = (concept.synonyms || []).map((s: string) => s.toLowerCase());

        let matchCount = 0;

        for (const source of processedSources) {
          const meta = (source.metadata && typeof source.metadata === "object") ? source.metadata as Record<string, any> : {};
          const sourceTerms: string[] = (meta.canonicalTermsFound || []).map((t: string) => t.toLowerCase());
          const content = source.content ? source.content.toLowerCase() : "";

          if (sourceTerms.includes(labelLower)) {
            matchCount++;
            continue;
          }

          const labelWords = labelLower.split(/[\s_-]+/).filter((w: string) => w.length > 2);
          const labelFound = content.includes(labelLower) ||
            (labelWords.length > 1 && labelWords.every((w: string) => content.includes(w)));

          if (labelFound) {
            matchCount++;
            continue;
          }

          let synFound = false;
          for (const syn of synonyms) {
            if (content.includes(syn) || sourceTerms.includes(syn)) {
              synFound = true;
              break;
            }
          }
          if (synFound) {
            matchCount++;
          }
        }

        if (matchCount > 0) {
          covered.push({
            conceptId: concept.id,
            label: concept.label,
            category: concept.category,
            sourceCount: matchCount,
          });
        } else {
          gaps.push({
            conceptId: concept.id,
            label: concept.label,
            category: concept.category,
            description: concept.description,
          });
        }
      }

      const totalConcepts = allConcepts.length;
      const coveredCount = covered.length;
      const coveragePercent = totalConcepts > 0 ? Math.round((coveredCount / totalConcepts) * 100) : 100;

      res.json({
        totalConcepts,
        coveredConcepts: coveredCount,
        uncoveredConcepts: gaps.length,
        coveragePercent,
        gaps,
        covered,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/query", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { question, topK = 5 } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      const searchResults = await searchKnowledgeBaseChunks(req.params.id, question, topK, 0.3);

      const context = searchResults.map((r: any) => r.content).join("\n\n");

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
        sources: searchResults,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/check-staleness", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id);
      const kbThreshold = kb.stalenessThresholdDays ?? 90;
      const now = new Date();
      const details: Array<{ sourceId: string; name: string; freshnessStatus: string; processedAt: string | null; daysSinceProcessed: number | null }> = [];
      let fresh = 0, stale = 0, critical = 0;

      for (const source of sources) {
        const threshold = source.stalenessThresholdDays ?? kbThreshold;
        let status = "unknown";
        let daysSince: number | null = null;

        if (source.processedAt) {
          daysSince = Math.floor((now.getTime() - new Date(source.processedAt).getTime()) / (1000 * 60 * 60 * 24));
          if (daysSince > threshold * 2) {
            status = "critical";
            critical++;
          } else if (daysSince > threshold) {
            status = "stale";
            stale++;
          } else {
            status = "fresh";
            fresh++;
          }
        }

        await storage.updateKnowledgeSource(source.id, {
          freshnessStatus: status,
          lastFreshnessCheckAt: now,
        } as any);

        details.push({
          sourceId: source.id,
          name: source.name,
          freshnessStatus: status,
          processedAt: source.processedAt ? new Date(source.processedAt).toISOString() : null,
          daysSinceProcessed: daysSince,
        });
      }

      if (stale > 0 || critical > 0) {
        const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id);
        const affectedAgentIds = agentLinks.map(l => l.agentId);

        for (const agentId of affectedAgentIds) {
          await storage.updateAgent(agentId, { requiresRevalidation: true } as any);
        }

        await storage.createAuditEvent({
          agentId: affectedAgentIds[0] || "system",
          eventType: "knowledge.staleness_detected",
          severity: critical > 0 ? "high" : "medium",
          description: `KB "${kb.name}" has ${stale} stale and ${critical} critical sources. ${affectedAgentIds.length} agent(s) flagged for revalidation.`,
          metadata: { kbId: kb.id, kbName: kb.name, stale, critical, affectedAgentIds },
        });

        if (critical > 0) {
          const existingIncidents = await storage.getIncidents();
          for (const agentId of affectedAgentIds) {
            const hasOpenIncident = existingIncidents.some(
              (inc: any) => inc.agentId === agentId && inc.sourceMetric === "kb_staleness" && inc.status === "open" && (inc.sourceDetails as any)?.kbId === kb.id
            );
            if (!hasOpenIncident) {
              await storage.createIncident({
                agentId,
                title: `Critical KB staleness: "${kb.name}"`,
                description: `${critical} source(s) in knowledge base "${kb.name}" have not been refreshed in over ${kbThreshold * 2} days. Agent knowledge may be outdated.`,
                severity: "high",
                status: "open",
                sourceMetric: "kb_staleness",
                sourceDetails: { kbId: kb.id, criticalSources: details.filter(d => d.freshnessStatus === "critical").map(d => d.name) },
              } as any);
            }
          }
        }
      }

      res.json({
        kbId: kb.id,
        kbName: kb.name,
        sourcesChecked: sources.length,
        fresh,
        stale,
        critical,
        affectedAgents: (stale > 0 || critical > 0) ? (await storage.getKnowledgeBaseAgents(req.params.id)).length : 0,
        details,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/check-all-staleness", async (_req: Request, res: Response) => {
    try {
      const allKbs = await storage.getKnowledgeBases();
      const activeKbs = allKbs.filter(kb => kb.status === "active");
      const results: Array<{ kbId: string; kbName: string; fresh: number; stale: number; critical: number }> = [];
      let totalFresh = 0, totalStale = 0, totalCritical = 0;

      for (const kb of activeKbs) {
        const sources = await storage.getKnowledgeSources(kb.id);
        const kbThreshold = kb.stalenessThresholdDays ?? 90;
        const now = new Date();
        let fresh = 0, stale = 0, critical = 0;

        for (const source of sources) {
          const threshold = source.stalenessThresholdDays ?? kbThreshold;
          let status = "unknown";

          if (source.processedAt) {
            const daysSince = Math.floor((now.getTime() - new Date(source.processedAt).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince > threshold * 2) { status = "critical"; critical++; }
            else if (daysSince > threshold) { status = "stale"; stale++; }
            else { status = "fresh"; fresh++; }
          }

          await storage.updateKnowledgeSource(source.id, {
            freshnessStatus: status,
            lastFreshnessCheckAt: now,
          } as any);
        }

        if (stale > 0 || critical > 0) {
          const agentLinks = await storage.getKnowledgeBaseAgents(kb.id);
          const affectedAgentIds = agentLinks.map(l => l.agentId);

          for (const agentId of affectedAgentIds) {
            await storage.updateAgent(agentId, { requiresRevalidation: true } as any);
          }

          await storage.createAuditEvent({
            agentId: affectedAgentIds[0] || "system",
            eventType: "knowledge.staleness_detected",
            severity: critical > 0 ? "high" : "medium",
            description: `KB "${kb.name}" has ${stale} stale and ${critical} critical sources. ${affectedAgentIds.length} agent(s) flagged for revalidation.`,
            metadata: { kbId: kb.id, kbName: kb.name, stale, critical, affectedAgentIds },
          });

          if (critical > 0) {
            const existingIncidents = await storage.getIncidents();
            for (const agentId of affectedAgentIds) {
              const hasOpenIncident = existingIncidents.some(
                (inc: any) => inc.agentId === agentId && inc.sourceMetric === "kb_staleness" && inc.status === "open" && (inc.sourceDetails as any)?.kbId === kb.id
              );
              if (!hasOpenIncident) {
                await storage.createIncident({
                  agentId,
                  title: `Critical KB staleness: "${kb.name}"`,
                  description: `${critical} source(s) in KB "${kb.name}" have not been refreshed in over ${kbThreshold * 2} days.`,
                  severity: "high",
                  status: "open",
                  sourceMetric: "kb_staleness",
                  sourceDetails: { kbId: kb.id },
                } as any);
              }
            }
          }
        }

        totalFresh += fresh;
        totalStale += stale;
        totalCritical += critical;
        results.push({ kbId: kb.id, kbName: kb.name, fresh, stale, critical });
      }

      res.json({
        kbsChecked: activeKbs.length,
        totalFresh,
        totalStale,
        totalCritical,
        results,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/staleness-impact", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id);
      const staleSources = sources.filter(s => s.freshnessStatus === "stale" || s.freshnessStatus === "critical");
      const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id);

      const affectedAgents: Array<{ agentId: string; agentName: string; priority: number; requiresRevalidation: boolean }> = [];
      for (const link of agentLinks) {
        const agent = await storage.getAgent(link.agentId);
        if (agent) {
          affectedAgents.push({
            agentId: agent.id,
            agentName: agent.name,
            priority: link.priority,
            requiresRevalidation: !!(agent as any).requiresRevalidation,
          });
        }
      }

      res.json({
        kbId: kb.id,
        kbName: kb.name,
        staleSources: staleSources.length,
        criticalSources: staleSources.filter(s => s.freshnessStatus === "critical").length,
        affectedAgents,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
