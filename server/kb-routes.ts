import { Express, Request, Response } from "express";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { insertKnowledgeBaseSchema, insertKnowledgeSourceSchema, insertAgentKnowledgeBaseSchema, knowledgeChunks, knowledgeSources, knowledgeSourceFiles, knowledgeBases, runTraces, contextEconomics, agentKnowledgeBases } from "@shared/schema";
import { sql, eq, desc, and, inArray } from "drizzle-orm";
import { createGuardedOpenAi } from "./ai-egress";
import { createHash } from "crypto";
import { generateEmbeddings, storeChunkEmbedding, ensurePgVector, normalizeRetrievalRequest, RetrievalQueryError } from "./embeddings";
import { splitTextSections, filenameForLog, ZipLimitError, type ExtractedFile } from "./file-extract";
import { knowledgeLimits } from "./config";
import { chunkSections, chunksForSourceContent, describeIndexing, embedBatchWithRetry, isPermanentEmbeddingError, legacyTruncationGap, settleAfterEmbedding, storeAndEmbedChunks, SPREADSHEET_INDEXING, type ChunkAudit, type PreparedChunk } from "./kb-indexing";
import { getOrgId, getDefaultOrgId } from "./auth";
import { checkPermission, getRequestRole } from "./permissions";
import { assertSafeOutboundUrl, safeFetch, UnsafeUrlError } from "./url-safety";
import { sensitivitySecondOpinion } from "./kb-sensitivity";

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

type DetectedSensitivityClass = { sensitivityClass: string; termsFound: string[]; regulation: string; requiredPolicyDomain: string };

/** Pure term-detection — the same keyword scan performSensitivityScan has
 *  always run, extracted so a classification level can be derived from ALL
 *  detections (regardless of whether a covering policy exists) without
 *  duplicating the scan or changing performSensitivityScan's own return shape. */
function detectSensitivityClasses(text: string): DetectedSensitivityClass[] {
  const textLower = text.toLowerCase();
  const detectedClasses: DetectedSensitivityClass[] = [];
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
  return detectedClasses;
}

/** Maps detected term classes to the 4-tier scale stored on
 *  knowledgeSources.sensitivityLevel. Regulated-data classes (PHI/PCI/
 *  financial) always outrank plain PII, which outranks "nothing detected".
 *  Deliberately never auto-assigns "internal" — that tier is for a human to
 *  set explicitly; keyword matching can't distinguish "internal but
 *  ordinary" from "public", so undetected content stays "public". */
function classifySensitivityLevel(detected: DetectedSensitivityClass[]): "public" | "confidential" | "restricted" {
  if (detected.some(d => d.sensitivityClass === "PHI" || d.sensitivityClass === "PCI" || d.sensitivityClass === "FINANCIAL_RESTRICTED")) return "restricted";
  if (detected.some(d => d.sensitivityClass === "PII")) return "confidential";
  return "public";
}

async function performSensitivityScan(
  text: string,
  kbId: string,
  industryId: string,
  orgId?: string,
  sourceId?: string,
): Promise<SensitivityWarning[]> {
  const detectedClasses = detectSensitivityClasses(text);

  // The keyword level, then a second opinion from the decision seam that can
  // raise it and never lower it (server/kb-sensitivity.ts). In shadow the
  // keyword level stands and the model's answer is only recorded.
  const keywordLevel = classifySensitivityLevel(detectedClasses);
  const opinion = await sensitivitySecondOpinion({ text, keywordLevel, orgId, subject: sourceId ? `${kbId}:${sourceId}` : kbId });

  if (sourceId) {
    try {
      await storage.updateKnowledgeSource(sourceId, { sensitivityLevel: opinion.level });
    } catch (err: any) {
      console.log("[kb] Failed to persist sensitivity classification (non-blocking):", err.message);
    }
    if (opinion.raisedFrom) {
      try {
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "kb-sensitivity-scanner",
          action: "knowledge.sensitivity_raised",
          objectType: "knowledge_base",
          objectId: kbId,
          details: JSON.stringify({ sourceId, from: opinion.raisedFrom, to: opinion.level, by: opinion.model, confidence: opinion.confidence, reason: "The decision model judged the content more sensitive than the keyword scan did; a second opinion can raise a level and never lower it." }),
          industryId,
        });
      } catch (err: any) {
        console.log("[kb] Failed to log sensitivity raise audit event:", err.message);
      }
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

// Chunking, batched embedding and the source's indexing record live in
// server/kb-indexing.ts; splitOversizedChunk and chunksForSourceContent are
// re-exported for existing callers.
export { splitOversizedChunk, chunksForSourceContent, SPREADSHEET_INDEXING } from "./kb-indexing";

// Text extraction lives in server/file-extract.ts so every upload surface
// (KB, workspace attachments, wizard, process flow) reads a file identically.
// That module also adds xlsx/pptx and, importantly, REFUSES types it cannot
// read -- the version that used to live here ended in
// `return buffer.toString("utf-8")`, so an uploaded spreadsheet or deck was
// ingested as zip binary, chunked, and embedded into retrieval as garbage.
async function extractUploadedDocument(buffer: Buffer, mimeType: string, filename: string) {
  const { extractTextFromFile: extract } = await import("./file-extract");
  return extract(buffer, mimeType, filename);
}

/** True when storing `incomingBytes` more would pass the organization's original-file quota. */
export function orgStorageWouldExceed(usedBytes: number, incomingBytes: number, quota = knowledgeLimits.orgStoredBytes): boolean {
  return usedBytes + incomingBytes > quota;
}

export class OrgStorageQuotaError extends Error {
  constructor() {
    super("This organization has reached its Knowledge Base file storage limit.");
    this.name = "OrgStorageQuotaError";
  }
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function organizationStoredBytes(organizationId: string | null, executor: Pick<DbTx, "execute"> = db): Promise<number> {
  const result = organizationId
    ? await executor.execute(sql`
        SELECT COALESCE(SUM(f.size_bytes), 0) AS used
        FROM knowledge_source_files f
        JOIN knowledge_sources s ON s.id = f.source_id
        JOIN knowledge_bases b ON b.id = s.knowledge_base_id
        WHERE b.organization_id = ${organizationId}
      `)
    : await executor.execute(sql`
        SELECT COALESCE(SUM(f.size_bytes), 0) AS used
        FROM knowledge_source_files f
        JOIN knowledge_sources s ON s.id = f.source_id
        JOIN knowledge_bases b ON b.id = s.knowledge_base_id
        WHERE b.organization_id IS NULL
      `);
  const used = Number((result.rows?.[0] as { used?: unknown } | undefined)?.used ?? 0);
  return Number.isFinite(used) ? used : 0;
}

export async function assertOrgFileQuota(organizationId: string | null | undefined, incomingBytes: number): Promise<void> {
  const used = await organizationStoredBytes(organizationId ?? null);
  if (orgStorageWouldExceed(used, incomingBytes)) throw new OrgStorageQuotaError();
}

async function organizationIdForSource(sourceId: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT b.organization_id AS organization_id
    FROM knowledge_sources s
    JOIN knowledge_bases b ON b.id = s.knowledge_base_id
    WHERE s.id = ${sourceId}
    LIMIT 1
  `);
  const id = (result.rows?.[0] as { organization_id?: string | null } | undefined)?.organization_id;
  return id ?? null;
}

/**
 * The uploaded file behind a document source, kept so reprocessing re-reads
 * the document itself. A source whose file could not be kept is still indexed
 * now, and later reprocessing falls back to its stored text. Exceeding the
 * organization's storage quota is not that case: it throws so the upload is refused.
 */
export async function saveSourceFile(
  sourceId: string,
  file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number },
  organizationId?: string | null,
): Promise<boolean> {
  try {
    const [existing] = await db.select({ sourceId: knowledgeSourceFiles.sourceId }).from(knowledgeSourceFiles).where(eq(knowledgeSourceFiles.sourceId, sourceId));
    if (existing) return true;
    const orgId = organizationId !== undefined ? organizationId : await organizationIdForSource(sourceId);
    const incomingBytes = file.size ?? file.buffer.length;
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    // The sum and the insert have to see each other. Two uploads that both
    // read the total before either inserts would both pass. The lock is the
    // same transaction-scoped advisory lock audit writes use, held only across
    // this check and insert, and released when the transaction ends.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`kb-org-files:${orgId ?? "__no_org__"}`}))`);
      const [held] = await tx.select({ sourceId: knowledgeSourceFiles.sourceId }).from(knowledgeSourceFiles).where(eq(knowledgeSourceFiles.sourceId, sourceId));
      if (held) return;
      const used = await organizationStoredBytes(orgId, tx);
      if (orgStorageWouldExceed(used, incomingBytes)) throw new OrgStorageQuotaError();
      await tx.insert(knowledgeSourceFiles).values({
        sourceId,
        filename: file.originalname,
        mimeType: file.mimetype ?? null,
        sizeBytes: incomingBytes,
        sha256,
        content: file.buffer,
      }).onConflictDoNothing();
    });
    return true;
  } catch (err: any) {
    if (err instanceof OrgStorageQuotaError) throw err;
    console.warn(`[kb] Could not keep the original file for source ${sourceId}; reprocessing will use its stored text:`, err?.message ?? err);
    return false;
  }
}

async function loadSourceFile(sourceId: string): Promise<{ filename: string; mimeType: string | null; content: Buffer } | null> {
  try {
    const [row] = await db.select().from(knowledgeSourceFiles).where(eq(knowledgeSourceFiles.sourceId, sourceId));
    return row ? { filename: row.filename, mimeType: row.mimeType ?? null, content: row.content } : null;
  } catch {
    return null;
  }
}

/** A source as the list endpoints return it: the stored text cut to a
 *  preview (a large workbook's is millions of characters), and without the
 *  per-row records an earlier ingestion kept in its metadata. */
export function sourceForList<T extends { content?: string | null; metadata?: unknown }>(source: T): T & { contentChars: number } {
  const content = source.content ?? "";
  const meta = source.metadata && typeof source.metadata === "object" ? { ...(source.metadata as Record<string, unknown>) } : source.metadata;
  if (meta && typeof meta === "object") delete (meta as Record<string, unknown>).records;
  return {
    ...source,
    content: content.length > SOURCE_PREVIEW_CHARS ? `${content.slice(0, SOURCE_PREVIEW_CHARS)}…` : content,
    metadata: meta,
    contentChars: content.length,
  };
}

const SOURCE_PREVIEW_CHARS = 2_000;

async function fetchWebContent(url: string): Promise<{ text: string; sourceDate?: string }> {
  const { text, sourceDate } = await fetchWebContentWithLinks(url);
  return { text, sourceDate };
}

// Backlog B44: the only source type with a real, automatic date signal is a
// URL fetch's own response headers -- a plain text paste or an uploaded file
// carries no such signal without per-format metadata extraction, which is
// separate, larger work. Last-Modified is the server's own claim about when
// the page's content changed; Date (always present) is a weaker fallback --
// only when the page came back, not when it was written.
function sourceDateFromResponse(response: globalThis.Response): string | undefined {
  const raw = response.headers.get("last-modified") || response.headers.get("date");
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function fetchWebContentWithLinks(url: string): Promise<{ text: string; links: string[]; sourceDate?: string }> {
  // SSRF guard: safeFetch resolves the hostname once, refuses private/loopback/link-local
  // targets, connects to the address it checked, and judges every redirect the same way.
  // Applied to every page fetched (root ingestion AND each crawled link), since a
  // same-domain link can still be re-pointed at an internal address via DNS.
  const response = await safeFetch(url, {
    headers: { "User-Agent": "NousAgent-KB/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  const sourceDate = sourceDateFromResponse(response);
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

  return { text, links, sourceDate };
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

/** Insert one window of chunks in a single statement, ids back in order. */
async function insertChunkRows(rows: Parameters<Parameters<typeof storeAndEmbedChunks>[2]["insertChunks"]>[0]) {
  if (rows.length === 0) return [];
  return db.insert(knowledgeChunks).values(rows).returning({ id: knowledgeChunks.id });
}

class EmbeddingUnavailableError extends Error {
  code = "disabled";
}

/**
 * Chunk, store and embed one source, then say on its row how much of it is
 * searchable. `extracted` is the upload's own extraction, passed on the first
 * run so the file is not read twice; reprocessing re-reads the stored
 * original file, and falls back to the stored text for sources that have none.
 */
export async function processSourceInBackground(sourceId: string, kbId: string, rescan = false, extracted?: ExtractedFile) {
  const startedAt = Date.now();
  try {
    const source = await storage.getKnowledgeSource(sourceId);
    const kb = await storage.getKnowledgeBase(kbId);
    if (!source || !kb) return;

    await storage.updateKnowledgeSource(sourceId, { status: "processing" });

    let text = source.content || "";
    let sourceDate: string | undefined;
    let from: "original_file" | "fetched_page" | "stored_text" = "stored_text";
    let dropLegacyRecords = false;

    if (source.sourceType === "url" && source.url) {
      const fetched = await fetchWebContent(source.url);
      text = fetched.text;
      sourceDate = fetched.sourceDate;
      from = "fetched_page";
      await storage.updateKnowledgeSource(sourceId, { content: text });
    } else if (source.sourceType === "document") {
      if (!extracted) {
        const original = await loadSourceFile(sourceId);
        if (original) {
          extracted = await extractUploadedDocument(original.content, original.mimeType ?? source.mimeType ?? "", original.filename);
        }
      }
      if (extracted) {
        from = "original_file";
        dropLegacyRecords = true;
        if (extracted.text !== text) {
          text = extracted.text;
          await storage.updateKnowledgeSource(sourceId, { content: text });
        }
      }
    }

    if (!text || text.trim().length === 0) {
      await storage.updateKnowledgeSource(sourceId, { status: "error", errorMessage: "No text content extracted" });
      return;
    }

    // A URL source's text exists only now, and a reprocess may have fetched
    // different text: both are scanned here, where the add-time scan cannot
    // reach. Text, upload and structured sources were scanned when added.
    if (rescan) {
      try {
        await performSensitivityScan(text, kbId, (kb as any).industry, (kb as any).organizationId ?? undefined, sourceId);
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }
    }

    // A document read from its file is chunked section by section (page,
    // heading, slide, row), each chunk carrying where it came from. A source
    // with only stored text -- pasted text, a URL, a document uploaded before
    // files were kept -- is chunked as one text, or from the per-row records
    // an earlier workbook ingestion kept in its metadata.
    let prepared: PreparedChunk[];
    let audit: ChunkAudit | undefined;
    if (extracted?.sections && extracted.sections.length > 0) {
      ({ chunks: prepared, audit } = chunkSections(extracted.sections, kb.chunkSize, kb.chunkOverlap));
    } else if (from === "original_file") {
      ({ chunks: prepared, audit } = chunkSections(splitTextSections(text, 4_000), kb.chunkSize, kb.chunkOverlap));
    } else {
      prepared = chunksForSourceContent(text, source.metadata, kb.chunkSize, kb.chunkOverlap);
    }
    const gaps: string[] = [];
    if (from === "stored_text" && source.sourceType === "document") {
      const gap = legacyTruncationGap(text);
      if (gap) gaps.push(gap);
    }

    // Reprocessing replaces the source's chunks; the first run has none.
    await storage.deleteKnowledgeChunksBySource(sourceId);

    const vectorsAvailable = await ensurePgVector();
    const report = await storeAndEmbedChunks({ knowledgeBaseId: kbId, sourceId }, prepared, {
      insertChunks: insertChunkRows,
      embed: async (texts) => {
        if (!vectorsAvailable) throw new EmbeddingUnavailableError("The vector store (pgvector) is not available in this database.");
        return generateEmbeddings(texts);
      },
      // The same text that was embedded, so the stored hash describes the
      // vector rather than whatever the chunk row happens to say later.
      storeEmbedding: (chunkId, embedding, chunkText) => storeChunkEmbedding(chunkId, embedding, chunkText),
      progress: async (r) => {
        if (r.chunksStored >= r.chunks) return;
        const live = await storage.getKnowledgeSource(sourceId);
        const meta = (live?.metadata && typeof live.metadata === "object") ? live.metadata as Record<string, any> : {};
        await storage.updateKnowledgeSource(sourceId, {
          chunkCount: r.chunksStored,
          metadata: { ...meta, indexingProgress: { chunks: r.chunks, stored: r.chunksStored, embedded: r.embedded, failed: r.embeddingFailed } },
        });
      },
    }, { chunkMetadata: sourceDate ? { sourceDate } : undefined });

    const outcome = describeIndexing({ extraction: extracted?.meta.coverage, audit, report, from, gaps });
    const logLine = `[kb-index] source=${sourceId} kb=${kbId} from=${from} status=${outcome.status} ` +
      `sections=${audit?.sections ?? "-"} chunks=${report.chunks} embedded=${report.embedded} failed=${report.embeddingFailed} ` +
      `ms=${Date.now() - startedAt}`;
    if (outcome.status === "processed") console.log(logLine);
    else console.warn(`${logLine} -- ${outcome.errorMessage}`);

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
    const existingMeta = (freshSource?.metadata && typeof freshSource.metadata === "object") ? { ...(freshSource.metadata as Record<string, any>) } : {};
    delete existingMeta.indexingProgress;
    if (dropLegacyRecords) {
      // Read from the file now; the row copies an earlier ingestion kept are
      // superseded and only weigh down every read of this row.
      delete existingMeta.records;
      if (existingMeta.indexing === SPREADSHEET_INDEXING) delete existingMeta.indexing;
    }
    const extractMeta = extracted?.meta;
    await storage.updateKnowledgeSource(sourceId, {
      status: outcome.status,
      errorMessage: outcome.errorMessage,
      chunkCount: report.chunksStored,
      processedAt: new Date(),
      freshnessStatus: "fresh",
      lastFreshnessCheckAt: new Date(),
      metadata: {
        ...existingMeta,
        ...ontologyMeta,
        ...(sourceDate ? { sourceDate } : {}),
        ...(extractMeta?.pages ? { pages: extractMeta.pages } : {}),
        ...(extractMeta?.sheets ? { sheets: extractMeta.sheets } : {}),
        ...(extractMeta?.slides ? { slides: extractMeta.slides } : {}),
        indexingReport: outcome.record,
      },
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

/**
 * Add a text source to a knowledge base: stored pending, scanned for
 * sensitive content (non-blocking), then chunked and embedded in the
 * background. Shared by the route and the Astra Workspace; the caller has
 * already checked the knowledge base is in its organization.
 */
export async function addTextSource(input: { kb: { id: string; industry: string }; orgId: string | undefined; title?: string; content: string }) {
  const source = await storage.createKnowledgeSource({
    knowledgeBaseId: input.kb.id,
    name: input.title || "Manual Entry",
    sourceType: "text",
    status: "pending",
    content: input.content,
    metadata: {},
  });
  const allSources = await storage.getKnowledgeSources(input.kb.id);
  await storage.updateKnowledgeBase(input.kb.id, { totalSources: allSources.length });

  let sensitivityWarnings: SensitivityWarning[] = [];
  try {
    sensitivityWarnings = await performSensitivityScan(input.content, input.kb.id, input.kb.industry, input.orgId, source.id);
  } catch (err: any) {
    console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
  }

  processSourceInBackground(source.id, input.kb.id);
  return { source, sensitivityWarnings };
}

/**
 * Add a URL source (optionally crawling linked pages): the URL must be safe to
 * fetch from the server. Shared by the route and the Astra Workspace.
 */
export async function addUrlSource(input: { kb: { id: string }; url: string; name?: string; crawl?: boolean; crawlDepth?: number; maxPages?: number }) {
  try {
    await assertSafeOutboundUrl(input.url);
  } catch (e: any) {
    throw e instanceof UnsafeUrlError ? e : new UnsafeUrlError("That URL isn't reachable from this action.");
  }
  const enableCrawl = input.crawl === true;
  const crawlDepth = Math.min(Math.max(input.crawlDepth || 1, 1), 3);
  const maxPages = Math.min(Math.max(input.maxPages || 10, 1), 50);

  const metadata: Record<string, any> = { url: input.url };
  if (enableCrawl) {
    metadata.crawl = true;
    metadata.crawlDepth = crawlDepth;
    metadata.maxPages = maxPages;
    metadata.crawlStatus = "pending";
    metadata.crawledPages = 0;
    metadata.totalDiscovered = 0;
  }

  const source = await storage.createKnowledgeSource({
    knowledgeBaseId: input.kb.id,
    name: input.name || input.url,
    sourceType: "url",
    status: "pending",
    url: input.url,
    metadata,
  });
  const allSources = await storage.getKnowledgeSources(input.kb.id);
  await storage.updateKnowledgeBase(input.kb.id, { totalSources: allSources.length });

  processSourceInBackground(source.id, input.kb.id, true);
  if (enableCrawl) {
    crawlAndIngest(source.id, input.kb.id, input.url, crawlDepth, maxPages).catch((err) => {
      console.error(`[kb-crawl] Crawl failed for ${input.url}:`, err.message);
    });
  }
  return source;
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

  // Per-knowledge-base and agent-link routes are scoped by knowledgeBaseScope /
  // agentKnowledgeLinkScope (server/tenant-scope.ts); every write below needs
  // create_modify_blueprints, the permission building an agent needs.
  app.post("/api/knowledge-bases", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertKnowledgeBaseSchema.omit({ organizationId: true }).parse(req.body);
      const kb = await storage.createKnowledgeBase({ ...data, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
      res.status(201).json(kb);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/knowledge-bases/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    const kb = await storage.updateKnowledgeBase(req.params.id as string, req.body, getOrgId(req));
    if (!kb) {
      // updateKnowledgeBase scopes its WHERE clause by organizationId
      // (correct tenant-isolation behavior) -- a KB whose stored org
      // doesn't match the caller's current org context matches zero rows
      // here even though GET on the same id just returned it fine, which
      // read to a tester as "the edit silently didn't save" since a bare
      // 404 gives no hint that org scope, not existence, was the problem.
      const existsAtAll = await storage.getKnowledgeBase(req.params.id as string);
      return res.status(404).json({
        message: existsAtAll
          ? "This Knowledge Base belongs to a different organization than your current session and can't be edited from here."
          : "Not found",
      });
    }
    res.json(kb);
  });

  app.delete("/api/knowledge-bases/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    const success = await storage.deleteKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/sources", async (req, res) => {
    const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
    const sources = await storage.getKnowledgeSources(req.params.id as string);
    res.json(sources.map(sourceForList));
  });

  app.post("/api/knowledge-bases/:id/sources/upload", checkPermission("create_modify_blueprints"), upload.single("file"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
          sensitivityWarnings = await performSensitivityScan(combinedText, req.params.id as string, kb.industry, getOrgId(req), source.id);
        } catch (err: any) {
          console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
        }

        processSourceInBackground(source.id, req.params.id as string);
        return res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
      }

      const extracted = await extractUploadedDocument(file.buffer, file.mimetype, file.originalname);
      const text = extracted.text;
      const metadata: Record<string, unknown> = { originalName: file.originalname, extractedKind: extracted.kind };
      if (extracted.meta.coverage) metadata.extraction = extracted.meta.coverage;
      console.log(
        `[file-extract] kb=${req.params.id} file="${filenameForLog(file.originalname)}" kind=${extracted.kind} bytes=${file.size} chars=${text.length} ` +
        `sections=${extracted.sections?.length ?? 0}` +
        (extracted.meta.coverage ? ` ${extracted.meta.coverage.unit}s=${extracted.meta.coverage.unitsKept}/${extracted.meta.coverage.unitsTotal} complete=${extracted.meta.coverage.complete}` : ""),
      );

      try {
        await assertOrgFileQuota(kb.organizationId ?? null, file.size ?? file.buffer.length);
      } catch (err) {
        if (err instanceof OrgStorageQuotaError) return res.status(413).json({ message: err.message });
        console.warn("[kb] Could not check the organization file quota; the upload continues:", err instanceof Error ? err.message : err);
      }

      const source = await storage.createKnowledgeSource({
        knowledgeBaseId: req.params.id as string,
        name: file.originalname,
        sourceType: "document",
        status: "pending",
        content: text,
        metadata,
        fileSize: file.size,
        mimeType: file.mimetype,
      });

      let sensitivityWarnings: SensitivityWarning[] = [];
      try {
        sensitivityWarnings = await performSensitivityScan(text, req.params.id as string, kb.industry, getOrgId(req), source.id);
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }

      let originalKept = false;
      try {
        originalKept = await saveSourceFile(source.id, file, kb.organizationId ?? null);
      } catch (err) {
        if (err instanceof OrgStorageQuotaError) {
          await storage.deleteKnowledgeSource(source.id, kb.organizationId ?? undefined).catch(() => {});
          return res.status(413).json({ message: err.message });
        }
        throw err;
      }
      const allSources = await storage.getKnowledgeSources(req.params.id as string);
      await storage.updateKnowledgeBase(req.params.id as string, { totalSources: allSources.length });
      processSourceInBackground(source.id, req.params.id as string, false, extracted);
      res.status(201).json({
        ...sourceForList(source),
        originalFileKept: originalKept,
        extraction: extracted.meta.coverage,
        sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined,
      });
    } catch (error: any) {
      // An unreadable file is the user's problem to fix (wrong format, a legacy
      // .xls), not a server fault -- 400 carrying the reader's own message,
      // which names the supported types or the re-save step.
      if (error instanceof ZipLimitError || error?.name === "UnsupportedFileTypeError" || error?.name === "LegacyOfficeFormatError") {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/url", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { url, name, crawl, crawlDepth: rawDepth, maxPages: rawMax } = req.body;
      if (!url) return res.status(400).json({ message: "URL is required" });
      let source;
      try {
        source = await addUrlSource({ kb, url, name, crawl: crawl === true, crawlDepth: parseInt(rawDepth) || 1, maxPages: parseInt(rawMax) || 10 });
      } catch (e: any) {
        if (e instanceof UnsafeUrlError) return res.status(400).json({ message: e.message });
        throw e;
      }
      res.status(201).json(source);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/text", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { title, content } = req.body;
      if (!content) return res.status(400).json({ message: "Content is required" });

      const { source, sensitivityWarnings } = await addTextSource({ kb, orgId: getOrgId(req), title, content });
      res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/structured", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
        sensitivityWarnings = await performSensitivityScan(combinedText, req.params.id as string, kb.industry, getOrgId(req), source.id);
      } catch (err: any) {
        console.log("[kb] Sensitivity scan failed (non-blocking):", err.message);
      }

      processSourceInBackground(source.id, req.params.id as string);
      res.status(201).json({ ...source, sensitivityWarnings: sensitivityWarnings.length > 0 ? sensitivityWarnings : undefined });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.patch("/api/knowledge-bases/:id/sources/:sourceId", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const source = await storage.getKnowledgeSource(req.params.sourceId as string, getOrgId(req));
      if (!source) return res.status(404).json({ message: "Source not found" });
      const { name, status, metadata } = req.body;
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (status !== undefined) updates.status = status;
      if (metadata !== undefined) updates.metadata = metadata;
      const updated = await storage.updateKnowledgeSource(req.params.sourceId as string, updates, getOrgId(req));
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/sources/:sourceId/reprocess", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const source = await storage.getKnowledgeSource(req.params.sourceId as string, getOrgId(req));
      if (!source) return res.status(404).json({ message: "Source not found" });

      await storage.deleteKnowledgeChunksBySource(req.params.sourceId as string);
      await storage.updateKnowledgeSource(req.params.sourceId as string, { status: "pending", chunkCount: 0, errorMessage: null });

      processSourceInBackground(req.params.sourceId as string, req.params.id as string, true);
      res.json({ message: "Reprocessing started" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/knowledge-bases/:id/embed", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id as string);
      if (chunks.length === 0) return res.json({ total: 0, embedded: 0, message: "No chunks to embed" });

      const { ensurePgVector } = await import("./embeddings");
      const pgReady = await ensurePgVector();
      if (!pgReady) return res.status(500).json({ message: "Vector database not available" });

      // One query for the whole base, not one per chunk. The loop form was an
      // N+1 of the same shape that made /api/drift-signals take 72 seconds.
      // Read from the ACTIVE model's store (server/embedding-backend.ts): the legacy column until an administrator switches
      // document search to another model on the Model Providers page.
      const { embeddingFacts } = await import("./embeddings");
      const { target: activeTarget, facts } = await embeddingFacts(req.params.id as string);
      const hasVector = new Map<string, boolean>();
      for (const [id, f] of facts) hasVector.set(id, f.hasVector);
      const stateOf = (c: any) => chunkVectorState({ content: c.content, contentHash: facts.get(c.id)?.contentHash, embeddingModel: facts.get(c.id)?.embeddingModel }, hasVector.get(c.id) ?? false, activeTarget.stamp);

      /**
       * What to embed. The default is unchanged -- chunks with no vector --
       * because widening it by default would re-embed every chunk on the
       * platform at OpenAI's expense the first time anyone pressed the button.
       *
       * `include=stale` also re-embeds a vector whose text has changed since
       * it was computed, and `include=unattributed` one stored before
       * knowledge_chunks recorded what it represents (design section 6f).
       * `include=all` does both. Opt-in, because the cost is real and the
       * caller should choose to pay it.
       */
      const include = String((req.query.include ?? "")).toLowerCase();
      const wantStale = include === "stale" || include === "all";
      const wantUnattributed = include === "unattributed" || include === "all";
      const { chunkVectorState } = await import("./embeddings");

      const missingChunks: typeof chunks = [];
      for (const chunk of chunks) {
        const state = stateOf(chunk);
        if (state === "never_embedded") missingChunks.push(chunk);
        else if (wantStale && (state === "stale" || state === "model_changed")) missingChunks.push(chunk);
        else if (wantUnattributed && state === "unattributed") missingChunks.push(chunk);
      }

      // "Nothing to do" is not the same as "all current", and saying the first
      // when the second is false is the confusion this layer exists to remove:
      // with the default include, a base of entirely unattributed vectors
      // reports "all chunks already have embeddings", which is true and
      // misleading. Name what was skipped.
      if (missingChunks.length === 0) {
        const skipped = chunks.reduce((acc: Record<string, number>, c) => {
          const s = stateOf(c);
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {});
        const needsAttention = (skipped.stale ?? 0) + (skipped.model_changed ?? 0) + (skipped.unattributed ?? 0);
        return res.json({
          total: chunks.length, embedded: 0, alreadyEmbedded: chunks.length, states: skipped,
          message: needsAttention > 0
            ? `No chunk is missing a vector, but ${needsAttention} would be re-embedded with include=all (stale or unattributed).`
            : "All chunks already have embeddings",
        });
      }

      // In bounded requests with retry: one failing request leaves only its
      // own chunks without vectors, and is reported, instead of failing the
      // whole base.
      let embeddedCount = 0;
      let failedCount = 0;
      let lastError: string | undefined;
      const EMBED_BATCH = 64;
      for (let b = 0; b < missingChunks.length; b += EMBED_BATCH) {
        const batch = missingChunks.slice(b, b + EMBED_BATCH);
        const texts = batch.map((c) => c.content);
        try {
          const { vectors } = await embedBatchWithRetry(texts, (t) => generateEmbeddings(t));
          for (let i = 0; i < batch.length; i++) {
            await storeChunkEmbedding(batch[i].id, vectors[i], texts[i]);
            hasVector.set(batch[i].id, true);
          }
          embeddedCount += batch.length;
        } catch (err: any) {
          failedCount += batch.length;
          lastError = String(err?.message ?? err).slice(0, 300);
          console.warn(`[kb-index] kb=${kb.id} embedding batch of ${batch.length} failed: ${lastError}`);
          if (isPermanentEmbeddingError(err)) {
            failedCount += missingChunks.length - (b + batch.length);
            break;
          }
        }
      }

      // A source left "partial" only by missing vectors becomes "processed"
      // once it has them all.
      const touched = new Set(missingChunks.map((c) => c.sourceId).filter(Boolean) as string[]);
      for (const sourceId of touched) {
        const src = await storage.getKnowledgeSource(sourceId);
        const meta = (src?.metadata && typeof src.metadata === "object") ? src.metadata as Record<string, any> : null;
        const record = meta?.indexingReport;
        if (!src || src.status !== "partial" || !record || typeof record.chunks !== "number") continue;
        const stillMissing = chunks.filter((c) => c.sourceId === sourceId && !hasVector.get(c.id)).length;
        const settled = settleAfterEmbedding(record, stillMissing, lastError);
        await storage.updateKnowledgeSource(sourceId, { status: settled.status, errorMessage: settled.errorMessage, metadata: { ...meta, indexingReport: settled.record } });
      }

      res.json({
        total: chunks.length,
        embedded: embeddedCount,
        failed: failedCount,
        alreadyEmbedded: chunks.length - missingChunks.length,
        message: failedCount > 0
          ? `Generated embeddings for ${embeddedCount} chunks; ${failedCount} still have none${lastError ? ` (${lastError})` : ""}.`
          : `Generated embeddings for ${embeddedCount} chunks`,
      });
    } catch (error: any) {
      console.error("[kb] Embedding generation error:", error.message);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/knowledge-bases/:id/embedding-status", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const chunks = await storage.getKnowledgeChunks(req.params.id as string);
      if (chunks.length === 0) return res.json({ total: 0, withEmbeddings: 0, withoutEmbeddings: 0, states: {} });

      try {
        const { embeddingFacts } = await import("./embeddings");
        const { target: activeTarget, facts } = await embeddingFacts(req.params.id as string);
        const hasVector = new Map<string, boolean>();
        for (const [id, f] of facts) hasVector.set(id, f.hasVector);
        const total = chunks.length;
        const withEmb = chunks.filter(c => hasVector.get(c.id)).length;

        /**
         * What the vectors ARE, not just how many exist (design section 6f).
         *
         * This endpoint's job is to say what state a base's embeddings are in,
         * and it could only count them: a base of vectors computed from text
         * that has since changed reported "fully embedded", identically to one
         * that was current. Those are different facts and only one of them
         * means search will work.
         *
         * The old three keys are unchanged so existing callers keep working.
         */
        const { chunkVectorState } = await import("./embeddings");
        const states: Record<string, number> = { current: 0, stale: 0, model_changed: 0, never_embedded: 0, unattributed: 0 };
        for (const c of chunks) {
          states[chunkVectorState({ content: c.content, contentHash: facts.get(c.id)?.contentHash, embeddingModel: facts.get(c.id)?.embeddingModel }, hasVector.get(c.id) ?? false, activeTarget.stamp)]++;
        }

        res.json({
          total, withEmbeddings: withEmb, withoutEmbeddings: total - withEmb,
          states,
          // Said plainly, because a count a reader has to interpret is how
          // "0% passed" meant "never measured" for 630 eval suites.
          summary: states.current === total
            ? "Every chunk's vector matches its current text."
            : [
                states.current ? `${states.current} current` : null,
                states.stale ? `${states.stale} stale (text changed since embedding)` : null,
                states.model_changed ? `${states.model_changed} embedded by a different model` : null,
                states.unattributed ? `${states.unattributed} unattributed (embedded before the platform recorded what a vector represents)` : null,
                states.never_embedded ? `${states.never_embedded} never embedded` : null,
              ].filter(Boolean).join(", "),
        });
      } catch {
        res.json({ total: chunks.length, withEmbeddings: 0, withoutEmbeddings: chunks.length, states: {} });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.delete("/api/knowledge-bases/:kbId/sources/:sourceId", checkPermission("create_modify_blueprints"), async (req, res) => {
    const success = await storage.deleteKnowledgeSource(req.params.sourceId as string, getOrgId(req));
    if (!success) return res.status(404).json({ message: "Not found" });

    const allSources = await storage.getKnowledgeSources(req.params.kbId as string);
    const totalChunks = allSources.reduce((sum, s) => sum + (s.chunkCount || 0), 0);
    await storage.updateKnowledgeBase(req.params.kbId as string, {
      totalSources: allSources.length,
      totalChunks,
    });

    res.json({ success: true });
  });

  app.post("/api/knowledge-bases/:id/refresh-stats", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
    const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
    const chunks = await storage.getKnowledgeChunks(req.params.id as string);
    res.json(chunks);
  });

  app.post("/api/knowledge-bases/:id/search", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { query, topK = 5, scoreThreshold = 0.5 } = req.body ?? {};
      if (!query || typeof query !== "string") return res.status(400).json({ message: "Query is required" });

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      let normalized;
      try {
        normalized = normalizeRetrievalRequest({ query, topK, scoreThreshold }, { topK: 5, scoreThreshold: 0.5 });
      } catch (err) {
        if (err instanceof RetrievalQueryError) return res.status(400).json({ message: err.message });
        throw err;
      }
      const results = await searchKnowledgeBaseChunks(req.params.id as string, normalized.query, normalized.topK, normalized.scoreThreshold, getRequestRole(req));
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/agents/:agentId/knowledge-bases", async (req, res) => {
    const links = await storage.getAgentKnowledgeBases(req.params.agentId as string);
    const kbIds = links.map((l) => l.knowledgeBaseId);
    const allKbs = await storage.getKnowledgeBases(getOrgId(req));
    const linkedKbs = allKbs.filter((kb) => kbIds.includes(kb.id));
    res.json({ links, knowledgeBases: linkedKbs });
  });

  app.post("/api/agents/:agentId/knowledge-bases", checkPermission("create_modify_blueprints"), async (req, res) => {
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

  app.delete("/api/agents/:agentId/knowledge-bases/:linkId", checkPermission("create_modify_blueprints"), async (req, res) => {
    const success = await storage.deleteAgentKnowledgeBase((req.params.linkId as string));
    if (!success) return res.status(404).json({ message: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/knowledge-bases/:id/agents", async (req, res) => {
    const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
    if (!kb) return res.status(404).json({ message: "Knowledge base not found" });
    const links = await storage.getKnowledgeBaseAgents(req.params.id as string);
    res.json(links);
  });

  app.get("/api/knowledge-bases/:id/ontology-alignment", async (req, res) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
      const processedSources = sources.filter((s) => s.status === "processed" || s.status === "partial");

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
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
      if (!kb) return res.status(404).json({ message: "Knowledge base not found" });

      const { question, topK = 5 } = req.body ?? {};
      if (!question || typeof question !== "string") return res.status(400).json({ message: "Question is required" });

      const { searchKnowledgeBaseChunks } = await import("./embeddings");
      let normalized;
      try {
        normalized = normalizeRetrievalRequest({ query: question, topK, scoreThreshold: 0.3 }, { topK: 5, scoreThreshold: 0.3 });
      } catch (err) {
        if (err instanceof RetrievalQueryError) return res.status(400).json({ message: err.message });
        throw err;
      }
      const searchResults = await searchKnowledgeBaseChunks(req.params.id as string, normalized.query, normalized.topK, normalized.scoreThreshold, getRequestRole(req));

      const context = searchResults.map((r: any) => r.content).join("\n\n");

      const openai = createGuardedOpenAi("Answering from a knowledge base");
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

  app.post("/api/knowledge-bases/:id/check-staleness", checkPermission("create_modify_blueprints"), async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
          actorType: "system",
          actorId: "kb-staleness-checker",
          action: "knowledge.staleness_detected",
          objectType: "knowledge_base",
          objectId: kb.id,
          details: JSON.stringify({
            severity: critical > 0 ? "high" : "medium",
            description: `KB "${kb.name}" has ${stale} stale and ${critical} critical sources. ${affectedAgentIds.length} agent(s) flagged for revalidation.`,
            kbName: kb.name,
            stale,
            critical,
            affectedAgentIds,
          }),
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

  app.post("/api/knowledge-bases/check-all-staleness", checkPermission("create_modify_blueprints"), async (req: Request, res: Response) => {
    try {
      const allKbs = await storage.getKnowledgeBases(getOrgId(req));
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
            actorType: "system",
            actorId: "kb-staleness-checker",
            action: "knowledge.staleness_detected",
            objectType: "knowledge_base",
            objectId: kb.id,
            details: JSON.stringify({
              severity: critical > 0 ? "high" : "medium",
              description: `KB "${kb.name}" has ${stale} stale and ${critical} critical sources. ${affectedAgentIds.length} agent(s) flagged for revalidation.`,
              kbName: kb.name,
              stale,
              critical,
              affectedAgentIds,
            }),
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
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
        (s.status === "processed" || s.status === "partial") &&
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

  app.post("/api/knowledge-bases/:id/auto-tune", checkPermission("create_modify_blueprints"), async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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

  app.post("/api/knowledge-bases/:id/apply-tuning", checkPermission("create_modify_blueprints"), async (req: Request, res: Response) => {
    try {
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
          const currentConfig = (link.retrievalConfig as any) || { topK: 5, scoreThreshold: 0.3 };
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

      const updatedKb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
      const kb = await storage.getKnowledgeBase(req.params.id as string, getOrgId(req));
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
