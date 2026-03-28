import { Express, Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { insertKnowledgeBaseSchema, insertKnowledgeSourceSchema, insertAgentKnowledgeBaseSchema, knowledgeChunks, knowledgeSources, knowledgeBases, runTraces, contextEconomics, agentKnowledgeBases } from "@shared/schema";
import { sql, eq, desc, and, inArray } from "drizzle-orm";
import OpenAI from "openai";
import { generateEmbeddings, storeChunkEmbedding } from "./embeddings";
import { getOrgId, getDefaultOrgId } from "./auth";

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

interface SensitivityWarning {
  sensitivityClass: string;
  termsFound: string[];
  agentId: string;
  agentName: string;
  missingPolicyDomain: string;
  regulation: string;
}

const SENSITIVITY_TERMS: Record<string, { terms: string[]; regulation: string; requiredPolicyDomain: string }> = {
  PHI: {
    terms: [
      "patient", "diagnosis", "medical record", "health information", "protected health",
      "hipaa", "treatment plan", "prescription", "clinical", "electronic health record",
      "ehr", "phi", "health insurance", "medical history", "lab results",
      "vital signs", "discharge summary", "radiology", "pathology",
    ],
    regulation: "HIPAA",
    requiredPolicyDomain: "data_handling",
  },
  PCI: {
    terms: [
      "credit card", "card number", "cvv", "cardholder", "pci-dss", "pci dss",
      "payment card", "card verification", "primary account number", "pan",
      "magnetic stripe", "chip data", "pin block", "card expiration",
      "merchant id", "acquiring bank", "card brand",
    ],
    regulation: "PCI-DSS",
    requiredPolicyDomain: "data_handling",
  },
  PII: {
    terms: [
      "social security", "ssn", "date of birth", "driver license", "passport number",
      "national id", "tax id", "personal identification", "biometric",
      "fingerprint", "facial recognition",
    ],
    regulation: "GDPR/CCPA",
    requiredPolicyDomain: "data_handling",
  },
  FINANCIAL_RESTRICTED: {
    terms: [
      "account balance", "routing number", "iban", "swift code", "wire transfer",
      "bank account", "investment portfolio", "trading position", "margin call",
      "insider information", "material non-public", "mnpi",
    ],
    regulation: "GLBA/SOX",
    requiredPolicyDomain: "data_handling",
  },
};

async function performSensitivityScan(
  text: string,
  kbId: string,
  industryId: string,
  orgId?: string,
): Promise<SensitivityWarning[]> {
  const textLower = text.toLowerCase();
  const detectedClasses: Array<{ sensitivityClass: string; termsFound: string[]; regulation: string; requiredPolicyDomain: string }> = [];

  for (const [sensitivityClass, config] of Object.entries(SENSITIVITY_TERMS)) {
    const found = config.terms.filter(term => textLower.includes(term.toLowerCase()));
    if (found.length >= 2) {
      detectedClasses.push({
        sensitivityClass,
        termsFound: found.slice(0, 5),
        regulation: config.regulation,
        requiredPolicyDomain: config.requiredPolicyDomain,
      });
    }
  }

  if (detectedClasses.length === 0) return [];

  const agentLinks = await storage.getKnowledgeBaseAgents(kbId);
  if (agentLinks.length === 0) return [];

  const warnings: SensitivityWarning[] = [];
  const allPolicies = await storage.getPolicies(orgId);
  const activePolicies = allPolicies.filter(p => p.status === "active");

  for (const link of agentLinks) {
    const agent = await storage.getAgent(link.agentId, orgId);
    if (!agent) continue;

    const agentPolicyBindings = (agent.policyBindings as Array<{ policyName?: string; policyId?: string; enforcement?: string }>) || [];
    const boundPolicyNames = agentPolicyBindings.map(b => (b.policyName || "").toLowerCase());

    for (const detected of detectedClasses) {
      const hasCoveringPolicy = activePolicies.some(p => {
        if (p.domain !== detected.requiredPolicyDomain) return false;
        const policyNameLower = p.name.toLowerCase();
        const policyId = p.id;
        const isBoundToAgent = agentPolicyBindings.some(b => {
          const bindingRef = (b.policyId || b.policyName || "").toLowerCase();
          return bindingRef === policyId || bindingRef === policyNameLower ||
            policyNameLower.includes(bindingRef) || bindingRef.includes(policyNameLower);
        });
        if (!isBoundToAgent) return false;
        const regulationLower = detected.regulation.toLowerCase().split("/")[0];
        return policyNameLower.includes(regulationLower) ||
          policyNameLower.includes(detected.sensitivityClass.toLowerCase());
      });

      if (!hasCoveringPolicy) {
        warnings.push({
          sensitivityClass: detected.sensitivityClass,
          termsFound: detected.termsFound,
          agentId: agent.id,
          agentName: agent.name,
          missingPolicyDomain: detected.requiredPolicyDomain,
          regulation: detected.regulation,
        });
      }
    }
  }

  for (const warning of warnings) {
    try {
      await storage.createAuditEvent({
        actorType: "system",
        actorId: "kb-sensitivity-scanner",
        action: "knowledge.sensitivity_warning",
        objectType: "knowledge_base",
        objectId: kbId,
        details: JSON.stringify({
          sensitivityClass: warning.sensitivityClass,
          termsFound: warning.termsFound,
          agentId: warning.agentId,
          agentName: warning.agentName,
          missingPolicyDomain: warning.missingPolicyDomain,
          regulation: warning.regulation,
          industryId,
        }),
        industryId,
      });
    } catch (err: any) {
      console.log(`[kb] Failed to log sensitivity warning audit event:`, err.message);
    }
  }

  return warnings;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

async function convertHtmlTablesToMarkdown(html: string): Promise<string> {
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  $("table").each((_i: number, table: any) => {
    const rows: string[][] = [];
    $(table).find("tr").each((_j: number, tr: any) => {
      const cells: string[] = [];
      $(tr).find("th, td").each((_k: number, cell: any) => {
        cells.push($(cell).text().replace(/\|/g, "\\|").replace(/\n/g, " ").trim());
      });
      if (cells.length > 0) rows.push(cells);
    });

    if (rows.length === 0) return;

    const colCount = Math.max(...rows.map(r => r.length));
    const normalizedRows = rows.map(r => {
      while (r.length < colCount) r.push("");
      return r;
    });

    const headerRow = normalizedRows[0];
    const dataRows = normalizedRows.slice(1);

    const lines: string[] = [];
    lines.push("| " + headerRow.join(" | ") + " |");
    lines.push("| " + headerRow.map(() => "---").join(" | ") + " |");
    for (const row of dataRows) {
      lines.push("| " + row.join(" | ") + " |");
    }

    const mdTable = "\n\n" + lines.join("\n") + "\n\n";
    $(table).replaceWith(mdTable);
  });

  let text = $("body").html() || $.html();
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<\/li>/gi, "\n");
  text = text.replace(/<\/h[1-6]>/gi, "\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function jsonValueToString(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every(v => typeof v !== "object" || v === null)) return value.join(", ");
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

function flattenObject(obj: any, prefix: string = ""): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      entries.push([fullKey, ""]);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        entries.push([fullKey, "[]"]);
      } else if (value.every(v => typeof v !== "object" || v === null)) {
        entries.push([fullKey, value.join(", ")]);
      } else {
        entries.push([fullKey, `(${value.length} items)`]);
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === "object" && value[i] !== null) {
            entries.push(...flattenObject(value[i], `${fullKey}[${i}]`));
          } else {
            entries.push([`${fullKey}[${i}]`, String(value[i] ?? "")]);
          }
        }
      }
    } else if (typeof value === "object") {
      entries.push(...flattenObject(value, fullKey));
    } else {
      entries.push([fullKey, String(value)]);
    }
  }
  return entries;
}

function jsonRowToText(row: any): string {
  const flat = flattenObject(row);
  return flat.map(([k, v]) => `${k}: ${v}`).join("\n");
}

function jsonToStructuredText(data: any): string {
  if (Array.isArray(data)) {
    return data.map((row, i) => jsonRowToText(row)).join("\n\n---\n\n");
  }
  const topLevelKeys = Object.keys(data);
  const hasNestedSections = topLevelKeys.some(k => typeof data[k] === "object" && data[k] !== null);

  if (hasNestedSections && !Array.isArray(data)) {
    const sections: string[] = [];
    for (const key of topLevelKeys) {
      const value = data[key];
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
        for (let i = 0; i < value.length; i++) {
          const heading = `[${key} #${i + 1}]`;
          const flat = flattenObject(value[i]);
          sections.push(heading + "\n" + flat.map(([k, v]) => `${k}: ${v}`).join("\n"));
        }
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const heading = `[${key}]`;
        const flat = flattenObject(value);
        sections.push(heading + "\n" + flat.map(([k, v]) => `${k}: ${v}`).join("\n"));
      } else {
        sections.push(`${key}: ${jsonValueToString(value)}`);
      }
    }
    return sections.join("\n\n---\n\n");
  }

  return jsonRowToText(data);
}

function chunkText(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
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

  return chunks;
}

async function extractTextFromFile(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/csv" || filename.endsWith(".md") || filename.endsWith(".txt") || filename.endsWith(".csv")) {
    return buffer.toString("utf-8");
  }
  if (mimeType === "application/pdf" || filename.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || filename.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const htmlResult = await mammoth.convertToHtml({ buffer });
    if (htmlResult.value && htmlResult.value.includes("<table")) {
      return await convertHtmlTablesToMarkdown(htmlResult.value);
    }
    const textResult = await mammoth.extractRawText({ buffer });
    return textResult.value;
  }
  if (mimeType === "application/json" || filename.endsWith(".json")) {
    const json = JSON.parse(buffer.toString("utf-8"));
    return JSON.stringify(json, null, 2);
  }
  return buffer.toString("utf-8");
}

async function fetchWebContent(url: string): Promise<string> {
  const { text } = await fetchWebContentWithLinks(url);
  return text;
}

async function fetchWebContentWithLinks(url: string): Promise<{ text: string; links: string[] }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "NousAgent-KB/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  const html = await response.text();
  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, iframe, noscript").remove();
  let text: string;
  if ($("table").length > 0) {
    text = await convertHtmlTablesToMarkdown($.html());
  } else {
    text = $("body").text().replace(/\s+/g, " ").trim();
  }

  const baseUrl = new URL(url);
  const links: string[] = [];
  $("a[href]").each((_i: number, el: any) => {
    try {
      const href = $(el).attr("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:") || href.startsWith("tel:")) return;
      const resolved = new URL(href, url);
      if (resolved.hostname === baseUrl.hostname && (resolved.protocol === "http:" || resolved.protocol === "https:")) {
        resolved.hash = "";
        const normalized = resolved.toString();
        if (!links.includes(normalized) && normalized !== url) {
          links.push(normalized);
        }
      }
    } catch {}
  });

  return { text, links };
}

async function crawlAndIngest(parentSourceId: string, kbId: string, rootUrl: string, crawlDepth: number, maxPages: number) {
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  let pagesCreated = 0;

  visited.add(rootUrl);

  const updateCrawlProgress = async (status: string, crawledPages: number, totalDiscovered: number) => {
    try {
      const src = await storage.getKnowledgeSource(parentSourceId);
      const existingMeta = (src?.metadata && typeof src.metadata === "object") ? src.metadata as Record<string, any> : {};
      await storage.updateKnowledgeSource(parentSourceId, {
        metadata: { ...existingMeta, crawlStatus: status, crawledPages, totalDiscovered },
      });
    } catch {}
  };

  await updateCrawlProgress("crawling", 0, 0);

  while (queue.length > 0 && pagesCreated < maxPages) {
    const item = queue.shift();
    if (!item) break;

    if (item.depth > 0) {
      try {
        const { text, links } = await fetchWebContentWithLinks(item.url);
        if (text && text.trim().length > 100) {
          const childSource = await storage.createKnowledgeSource({
            knowledgeBaseId: kbId,
            name: `${new URL(item.url).pathname || item.url} (crawled)`,
            sourceType: "url",
            status: "pending",
            url: item.url,
            metadata: { url: item.url, crawledFrom: parentSourceId, crawlDepth: item.depth },
          });
          pagesCreated++;
          await updateCrawlProgress("crawling", pagesCreated, visited.size);
          processSourceInBackground(childSource.id, kbId);

          if (item.depth < crawlDepth) {
            for (const link of links) {
              if (!visited.has(link) && visited.size < maxPages * 3) {
                visited.add(link);
                queue.push({ url: link, depth: item.depth + 1 });
              }
            }
          }
        }
      } catch (err: any) {
        console.log(`[kb-crawl] Failed to fetch ${item.url}: ${err.message}`);
      }
    } else {
      try {
        const { links } = await fetchWebContentWithLinks(item.url);
        for (const link of links) {
          if (!visited.has(link)) {
            visited.add(link);
            queue.push({ url: link, depth: item.depth + 1 });
          }
        }
      } catch {}
    }
  }

  await updateCrawlProgress("complete", pagesCreated, visited.size);

  const refreshKbStats = async () => {
    const allSources = await storage.getKnowledgeSources(kbId);
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    await storage.updateKnowledgeBase(kbId, {
      totalSources: allSources.length,
      totalChunks,
    });
    return totalChunks;
  };

  await refreshKbStats();
  setTimeout(async () => {
    try { await refreshKbStats(); } catch {}
  }, 30000);
  setTimeout(async () => {
    try { await refreshKbStats(); } catch {}
  }, 90000);

  console.log(`[kb-crawl] Crawl complete for ${rootUrl}: ${pagesCreated} pages ingested from ${visited.size} discovered`);
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

    const freshSource = await storage.getKnowledgeSource(sourceId);
    const existingMeta = (freshSource?.metadata && typeof freshSource.metadata === "object") ? freshSource.metadata as Record<string, any> : {};
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
  app.get("/api/knowledge-bases", async (req, res) => {
    const kbs = await storage.getKnowledgeBases(getOrgId(req));
    res.json(kbs);
  });

  app.get("/api/knowledge-bases/:id", async (req, res) => {
    const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
    res.json(kb);
  });

  app.post("/api/knowledge-bases", async (req, res) => {
    try {
      const data = insertKnowledgeBaseSchema.omit({ organizationId: true }).parse(req.body);
      const kb = await storage.createKnowledgeBase({ ...data, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
      res.status(201).json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/knowledge-bases/:id", async (req, res) => {
    const kb = await storage.updateKnowledgeBase(req.params.id as string, req.body, getOrgId(req));
    if (!kb) return res.status(404).json({ message: "Not found" });
    res.json(kb);
  });

  app.delete("/api/knowledge-bases/:id", async (req, res) => {
    const success = await storage.deleteKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/sources", async (req, res) => {
    const sources = await storage.getKnowledgeSources(req.params.id as string);
    res.json(sources);
  });

  app.post("/api/knowledge-bases/:id/sources/upload", upload.single("file"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file provided" });

      const isJsonFile = file.originalname.toLowerCase().endsWith(".json") || file.mimetype === "application/json";

      if (isJsonFile) {
        const jsonText = file.buffer.toString("utf-8");
        let parsed: any;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          return res.status(400).json({ message: "Invalid JSON file" });
        }
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        if (rows.length === 0 || rows.some((r: any) => typeof r !== "object" || r === null)) {
          return res.status(400).json({ message: "JSON must be an object or array of objects" });
        }
        const combinedText = rows.length === 1
          ? jsonToStructuredText(rows[0])
          : jsonToStructuredText(rows);
        const rowCount = Array.isArray(parsed) ? parsed.length : 1;

        const source = await storage.createKnowledgeSource({
          knowledgeBaseId: req.params.id as string,
          name: file.originalname,
          sourceType: "structured",
          status: "pending",
          content: combinedText,
          metadata: { originalName: file.originalname, rowCount },
          fileSize: file.size,
          mimeType: file.mimetype,
        });

        const allSources = await storage.getKnowledgeSources(req.params.id as string);
        await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });

        let sensitivityWarnings: SensitivityWarning[] = [];
        try {
          sensitivityWarnings = await performSensitivityScan(combinedText, req.params.id as string, kb.industry, getOrgId(req));
        } catch (err: any) {
          console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
        }

        processSourceInBackground(source.id, req.params.id as string);
        return res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
      }

      const text = await extractTextFromFile(file.buffer, file.mimetype, file.originalname);

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id as string,
        name: file.originalname,
        sourceType: "document",
        status: "pending",
        content: text,
        metadata: { originalName: file.originalname },
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });

      let sensitivityWarnings: SensitivityWarning[] = [];
      try {
        sensitivityWarnings = await performSensitivityScan(text, req.params.id as string, kb.industry, getOrgId(req));
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }

      processSourceInBackground(source.id, req.params.id as string);
      res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/url", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { url, name, crawl, crawlDepth: rawDepth, maxPages: rawMax } = req.body;
      if (!url) return res.status(400).json({ message: "URL is required" });

      const enableCrawl = crawl === true;
      const crawlDepth = Math.min(Math.max(parseInt(rawDepth) || 1, 1), 3);
      const maxPages = Math.min(Math.max(parseInt(rawMax) || 10, 1), 50);

      const metadata: Record<string, any> = { url };
      if (enableCrawl) {
        metadata.crawl = true;
        metadata.crawlDepth = crawlDepth;
        metadata.maxPages = maxPages;
        metadata.crawlStatus = "pending";
        metadata.crawledPages = 0;
        metadata.totalDiscovered = 0;
      }

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id as string,
        name: name || url,
        sourceType: "url",
        status: "pending",
        url,
        metadata,
      });

      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });

      processSourceInBackground(source.id, req.params.id as string);

      if (enableCrawl) {
        crawlAndIngest(source.id, req.params.id as string, url, crawlDepth, maxPages).catch((err) => {
          console.error(`[kb-crawl] Crawl failed for ${url}:`, err.message);
        });
      }

      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/text", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { title, content } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id as string,
        name: title || "Manual Entry",
        sourceType: "text",
        status: "pending",
        content,
        metadata: {},
      });

      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });

      let sensitivityWarnings: SensitivityWarning[] = [];
      try {
        sensitivityWarnings = await performSensitivityScan(content, req.params.id as string, kb.industry, getOrgId(req));
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }

      processSourceInBackground(source.id, req.params.id as string);
      res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/structured", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { name, data, fieldMapping } = req.body;
      if (!data) return res.status(400).json({ message: "Data is required" });

      const rows = Array.isArray(data) ? data : [data];
      const textParts = rows.map((row: any) => {
        if (fieldMapping) {
          return Object.entries(fieldMapping)
            .map(([key, label]) => `${label}: ${jsonValueToString(row[key])}`)
            .join("\n");
        }
        return jsonRowToText(row);
      });
      const combinedText = textParts.join("\n\n---\n\n");

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id as string,
        name: name || "Structured Data Import",
        sourceType: "structured",
        status: "pending",
        content: combinedText,
        metadata: { rowCount: rows.length, fieldMapping },
      });

      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });

      let sensitivityWarnings: SensitivityWarning[] = [];
      try {
        sensitivityWarnings = await performSensitivityScan(combinedText, req.params.id as string, kb.industry, getOrgId(req));
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }

      processSourceInBackground(source.id, req.params.id as string);
      res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/:sourceId/reprocess", async (req, res) => {
    try {
      const source = await storage.getKnowledgeSource(req.params.sourceId as string);
      if (!source) return res.status(404).json({ message: "Source not found" });

      await storage.deleteKnowledgeChunksBySource(req.params.sourceId as string);
      await storage.updateKnowledgeSource(req.params.sourceId as string, { status: "pending", chunkCount: 0, errorMessage: null });

      processSourceInBackground(req.params.sourceId as string, req.params.id as string);
      res.json({ message: "Reprocessing started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/embed", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id as string);
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
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id as string);
      if (chunks.length === 0) return res.json({ total: 0, withEmbeddings: 0, withoutEmbeddings: 0 });

      try {
        const result = await db.execute(sql`
          SELECT COUNT(*) as total,
                 COUNT(embedding) as with_embeddings
          FROM knowledge_chunks WHERE knowledge_base_id = ${req.params.id as string}
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
    const success = await storage.deleteKnowledgeSource(req.params.sourceId as string);
    if (!success) return res.status(404).json({ message: "Not found" });

    const allSources = await storage.getKnowledgeSources(req.params.kbId as string);
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    await storage.updateKnowledgeBase(req.params.kbId as string, {
      totalSources: allSources.length,
      totalChunks,
    });

    res.json({ success: true });
  });

  app.post("/api/knowledge-bases/:id/refresh-stats", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
      await storage.updateKnowledgeBase(req.params.id as string, {
        totalSources: allSources.length,
        totalChunks,
      });
      res.json({ totalSources: allSources.length, totalChunks });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/chunks", async (req, res) => {
    const chunks = await storage.getKnowledgeChunks(req.params.id as string);
    res.json(chunks);
  });

  app.post("/api/knowledge-bases/:id/search", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { query, topK = 5, scoreThreshold = 0.5 } = req.body;
      if (!query) return res.status(400).json({ message: "Query is required" });

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      const results = await searchKnowledgeBaseChunks(req.params.id as string, query, topK, scoreThreshold);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/agents/:agentId/knowledge-bases", async (req, res) => {
    const links = await storage.getAgentKnowledgeBases(req.params.agentId as string);
    const kbIds = links.map((l) => l.knowledgeBaseId);
    const allKbs = await storage.getKnowledgeBases();
    const linkedKbs = allKbs.filter((kb) => kbIds.includes(kb.id));
    res.json({ links, knowledgeBases: linkedKbs });
  });

  app.post("/api/agents/:agentId/knowledge-bases", async (req, res) => {
    try {
      const data = insertAgentKnowledgeBaseSchema.parse({
        ...req.body,
        agentId: req.params.agentId as string,
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
    const links = await storage.getKnowledgeBaseAgents(req.params.id as string);
    res.json(links);
  });

  app.get("/api/knowledge-bases/:id/ontology-alignment", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id as string);
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
        knowledgeBaseId: req.params.id as string,
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
      const kb = await storage.getKnowledgeBase(req.params.id as string);
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

      const sources = await storage.getKnowledgeSources(req.params.id as string);
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
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { question, topK = 5 } = req.body;
      if (!question) return res.status(400).json({ message: "Question is required" });

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      const searchResults = await searchKnowledgeBaseChunks(req.params.id as string, question, topK, 0.3);

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
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id as string);
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
        const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id as string);
        const affectedAgentIds = agentLinks.map(l => l.agentId);

        for (const agentId of affectedAgentIds) {
          await storage.updateAgent(agentId, { requiresRevalidation: true } as any);
        }

        await storage.createAuditEvent({
          // @ts-expect-error
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
        affectedAgents: (stale > 0 || critical > 0) ? (await storage.getKnowledgeBaseAgents(req.params.id as string)).length : 0,
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
            // @ts-expect-error
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

  app.get("/api/knowledge-bases/:id/usage-analytics", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id as string);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const sourceAnalytics = sources.map(s => ({
        sourceId: s.id,
        name: s.name,
        sourceType: s.sourceType,
        status: s.status,
        retrievalCount: s.retrievalCount || 0,
        lastRetrievedAt: s.lastRetrievedAt,
        chunkCount: s.chunkCount,
        processedAt: s.processedAt,
      }));

      const deadSources = sourceAnalytics.filter(s =>
        s.retrievalCount === 0 &&
        s.status === "processed" &&
        s.processedAt && new Date(s.processedAt) < thirtyDaysAgo
      );

      const activeSources = sourceAnalytics.filter(s => s.retrievalCount > 0);
      const totalRetrievals = sourceAnalytics.reduce((sum, s) => sum + s.retrievalCount, 0);

      res.json({
        kbId: kb.id,
        kbName: kb.name,
        sources: sourceAnalytics,
        deadSources: deadSources.map(s => ({
          sourceId: s.sourceId,
          name: s.name,
          processedAt: s.processedAt,
          daysSinceProcessed: s.processedAt ? Math.floor((Date.now() - new Date(s.processedAt).getTime()) / (24 * 60 * 60 * 1000)) : null,
        })),
        summary: {
          totalSources: sources.length,
          activeSources: activeSources.length,
          deadSources: deadSources.length,
          totalRetrievals,
          avgRetrievalsPerSource: sources.length > 0 ? Math.round(totalRetrievals / sources.length * 10) / 10 : 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/auto-tune", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id as string);
      const agentIds = agentLinks.map(l => l.agentId);

      let allSimilarityScores: number[] = [];
      let overflowCount = 0;
      let analyzedRuns = 0;

      if (agentIds.length > 0) {
        const recentTraces = await db.select()
          .from(runTraces)
          .where(inArray(runTraces.agentId, agentIds))
          .orderBy(desc(runTraces.startedAt))
          .limit(200);

        const relevantTraces = recentTraces.filter(t => {
          const docs = t.retrievedDocs as any;
          if (!docs || !Array.isArray(docs)) return false;
          return docs.some((d: any) => d.kbId === req.params.id as string);
        }).slice(0, 50);

        analyzedRuns = relevantTraces.length;

        for (const trace of relevantTraces) {
          const docs = trace.retrievedDocs as any[];
          if (!docs) continue;
          for (const doc of docs) {
            if (doc.kbId !== req.params.id as string) continue;
            const chunks = doc.chunks || [];
            for (const chunk of chunks) {
              if (typeof chunk.similarityScore === "number") {
                allSimilarityScores.push(chunk.similarityScore);
              }
            }
          }
        }

        const recentEcon = await db.select()
          .from(contextEconomics)
          .where(inArray(contextEconomics.agentId, agentIds))
          .orderBy(desc(contextEconomics.createdAt))
          .limit(100);

        for (const econ of recentEcon) {
          const kbDetails = econ.kbSourceDetails as any[];
          const usesThisKb = Array.isArray(kbDetails) && kbDetails.some((d: any) => d.kbId === req.params.id as string);
          if (!usesThisKb) continue;
          const sections = econ.sections as any[];
          if (!sections) continue;
          const kbSection = sections.find((s: any) => s.category === "kb_retrieval");
          if (kbSection && kbSection.tokenCount > (econ.totalTokensUsed * 0.8)) {
            overflowCount++;
          }
        }
      }

      const avgSimilarity = allSimilarityScores.length > 0
        ? Math.round(allSimilarityScores.reduce((a, b) => a + b, 0) / allSimilarityScores.length * 1000) / 1000
        : 0;
      const highQualityChunks = allSimilarityScores.filter(s => s > 0.7).length;
      const retrievalUtilization = allSimilarityScores.length > 0
        ? Math.round(highQualityChunks / allSimilarityScores.length * 100)
        : 0;

      const recommendations: Array<{
        parameter: string;
        currentValue: number;
        recommendedValue: number;
        reason: string;
        confidence: string;
      }> = [];

      const currentTopK = agentLinks.length > 0
        ? ((agentLinks[0].retrievalConfig as any)?.topK ?? 5)
        : 5;

      if (analyzedRuns >= 5) {
        if (avgSimilarity < 0.6) {
          recommendations.push({
            parameter: "chunkOverlap",
            currentValue: kb.chunkOverlap,
            recommendedValue: Math.min(Math.round(kb.chunkOverlap * 1.5), Math.round(kb.chunkSize * 0.4)),
            reason: "Low average similarity scores suggest chunks lack sufficient context overlap for accurate retrieval",
            confidence: "medium",
          });
          recommendations.push({
            parameter: "chunkSize",
            currentValue: kb.chunkSize,
            recommendedValue: Math.max(Math.round(kb.chunkSize * 0.75), 128),
            reason: "Smaller chunks can improve retrieval precision when similarity scores are low",
            confidence: "medium",
          });
        }

        if (avgSimilarity > 0.85 && retrievalUtilization < 50) {
          recommendations.push({
            parameter: "retrievalTopK",
            currentValue: currentTopK,
            recommendedValue: 3,
            reason: "High similarity but low utilization suggests too many chunks are retrieved; reducing topK saves context budget",
            confidence: "high",
          });
        }

        if (overflowCount > 2) {
          recommendations.push({
            parameter: "chunkSize",
            currentValue: kb.chunkSize,
            recommendedValue: Math.max(Math.round(kb.chunkSize * 0.8), 128),
            reason: `${overflowCount} runs showed context overflow; smaller chunks reduce per-retrieval token cost`,
            confidence: "high",
          });
          if (!recommendations.some(r => r.parameter === "retrievalTopK")) {
            recommendations.push({
              parameter: "retrievalTopK",
              currentValue: currentTopK,
              recommendedValue: 3,
              reason: "Reducing topK alongside chunk size helps prevent context window overflow",
              confidence: "medium",
            });
          }
        }

        if (retrievalUtilization > 90 && avgSimilarity < 0.75) {
          recommendations.push({
            parameter: "retrievalTopK",
            currentValue: currentTopK,
            recommendedValue: currentTopK + 3,
            reason: "High utilization with moderate similarity suggests retrieving more chunks could capture missing relevant content",
            confidence: "medium",
          });
        }
      }

      res.json({
        kbId: kb.id,
        kbName: kb.name,
        analyzedRuns,
        metrics: {
          avgSimilarity,
          retrievalUtilization,
          overflowCount,
          totalSimilarityScores: allSimilarityScores.length,
        },
        recommendations,
        autoApplyAvailable: recommendations.length > 0 && analyzedRuns >= 5,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/apply-tuning", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { chunkSize, chunkOverlap, retrievalTopK } = req.body;
      const updates: any = {};
      const changes: Array<{ parameter: string; before: number; after: number }> = [];

      if (chunkSize !== undefined && typeof chunkSize === "number" && chunkSize >= 64 && chunkSize <= 4096) {
        changes.push({ parameter: "chunkSize", before: kb.chunkSize, after: chunkSize });
        updates.chunkSize = chunkSize;
      }
      if (chunkOverlap !== undefined && typeof chunkOverlap === "number" && chunkOverlap >= 0 && chunkOverlap <= 1024) {
        changes.push({ parameter: "chunkOverlap", before: kb.chunkOverlap, after: chunkOverlap });
        updates.chunkOverlap = chunkOverlap;
      }

      if (retrievalTopK !== undefined && typeof retrievalTopK === "number" && retrievalTopK >= 1 && retrievalTopK <= 20) {
        changes.push({ parameter: "retrievalTopK", before: 5, after: retrievalTopK });
        const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id as string);
        for (const link of agentLinks) {
          const currentConfig = (link.retrievalConfig as any) || { topK: 5, scoreThreshold: 0.7 };
          await db.update(agentKnowledgeBases)
            .set({ retrievalConfig: { ...currentConfig, topK: retrievalTopK } })
            .where(eq(agentKnowledgeBases.id, link.id));
        }
      }

      if (changes.length === 0) {
        return res.status(400).json({ message: "No valid tuning parameters provided. chunkSize (64-4096), chunkOverlap (0-1024), retrievalTopK (1-20)" });
      }

      if (Object.keys(updates).length > 0) {
        await storage.updateKnowledgeBase(req.params.id as string, updates);
      }

      try {
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "rag-auto-tuner",
          action: "rag_pipeline_tuned",
          objectType: "knowledge_base",
          objectId: kb.id,
          details: JSON.stringify({
            kbName: kb.name,
            changes,
            appliedAt: new Date().toISOString(),
          }),
        });
      } catch {}

      const updatedKb = await storage.getKnowledgeBase(req.params.id as string);
      res.json({
        kbId: kb.id,
        changes,
        updatedConfig: {
          chunkSize: updatedKb?.chunkSize || kb.chunkSize,
          chunkOverlap: updatedKb?.chunkOverlap || kb.chunkOverlap,
        },
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/staleness-impact", async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string);
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const sources = await storage.getKnowledgeSources(req.params.id as string);
      const staleSources = sources.filter(s => s.freshnessStatus === "stale" || s.freshnessStatus === "critical");
      const agentLinks = await storage.getKnowledgeBaseAgents(req.params.id as string);

      const affectedAgents: Array<{ agentId: string; agentName: string; priority: number; requiresRevalidation: boolean }> = [];
      for (const link of agentLinks) {
        const agent = await storage.getAgent(link.agentId, getOrgId(req));
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
