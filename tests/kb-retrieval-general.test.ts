/**
 * Exact and keyword retrieval for any document, not only a spreadsheet's id column.
 *
 * MOCKED: the database (db.execute answers by what the SQL asks for) and the
 * OpenAI client. REAL: searchKnowledgeBaseChunks and the queries it builds.
 *
 *   - an identifier inside a PDF page or a paragraph is matched verbatim in
 *     the chunk text, whatever its vector score;
 *   - a chunk a failed embedding batch left without a vector is still
 *     reachable by keyword;
 *   - without pgvector, results are ranked by keyword, not by recency.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY = "test-key-not-used";
});

const embedControl = vi.hoisted(() => ({ fail: false, failLexical: false, embeddedChars: [] as number[] }));
const execute = vi.hoisted(() => vi.fn());
vi.mock("../server/db", () => ({ db: { execute }, pool: { on: () => {} } }));
vi.mock("../server/permissions", () => ({ getAllowedKbSensitivityLevels: () => ["public", "internal"] }));
vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = {
      create: async ({ input }: { input: string[] }) => {
        embedControl.embeddedChars.push(...input.map((s) => s.length));
        if (embedControl.fail) throw new Error("provider down");
        return { data: input.map(() => ({ embedding: [0.1, 0.2, 0.3] })) };
      },
    };
  },
}));

function sqlText(node: unknown): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === "string" || typeof n === "number") { parts.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (typeof n !== "object") return;
    if (n.constructor?.name === "StringChunk" && Array.isArray(n.value)) { parts.push(n.value.join("")); return; }
    if (n.constructor?.name === "Param") { parts.push(String(n.value)); return; }
    if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(walk);
  };
  walk(node);
  return parts.join("");
}

const row = (id: string, content: string, metadata: Record<string, unknown> = {}) => ({
  id, content, similarity: null, metadata, source_id: "s1", chunk_index: 0, source_name: "doc", source_url: null,
});
const pdfPage = row("page-118", "Clause 14.2 requires notice under reference CN-2291-X within 30 days.", { page: 118 });
const unembedded = row("no-vector", "Escalation matrix for regional depots.", { page: 3 });
const recent = row("recent", "Most recently stored chunk.");

let pgvector = true;
const seen: string[] = [];

beforeEach(() => {
  embedControl.fail = false;
  embedControl.failLexical = false;
  embedControl.embeddedChars = [];
  seen.length = 0;
  execute.mockImplementation(async (query: unknown) => {
    const text = sqlText(query);
    seen.push(text);
    if (/CREATE EXTENSION/i.test(text)) {
      if (!pgvector) throw new Error("extension \"vector\" is not available");
      return { rows: [] };
    }
    if (/information_schema/i.test(text)) return { rows: [{ column_name: "embedding" }] };
    if (text.includes("~*")) return { rows: text.includes("CN\\-2291\\-X") ? [pdfPage] : [] };
    if (/productId/.test(text)) return { rows: [] };
    if (text.includes("<=>")) return { rows: [] };
    if (text.includes("to_tsquery")) {
      if (embedControl.failLexical) throw new Error("lexical down");
      return { rows: /escalation/.test(text) ? [unembedded] : [] };
    }
    if (/ORDER BY c\.created_at DESC/.test(text)) return { rows: [recent] };
    return { rows: [] };
  });
});

describe("identifier and keyword extraction", async () => {
  const { identifierTokens, lexicalTerms, productIdLookupKeys } = await import("../server/embeddings");
  it("takes code-like tokens, not words", () => {
    expect(identifierTokens("what does CN-2291-X say about clause 14.2?")).toEqual(["CN-2291-X", "14.2"]);
    expect(identifierTokens("which depots escalate first")).toEqual([]);
    expect(lexicalTerms("What is the escalation matrix for depots?")).toEqual(["escalation", "matrix", "depots"]);
    expect(productIdLookupKeys("SKU-1")).toEqual(["SKU-1"]);
  });
});

describe("with pgvector", () => {
  it("returns a chunk whose text contains the identifier, though its vector score is below the threshold", async () => {
    pgvector = true;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const results = await searchKnowledgeBaseChunks("kb", "notice period for CN-2291-X", 5, 0.3);
    expect(results.map((r) => r.id)).toContain("page-118");
    const regex = seen.find((s) => s.includes("~*"))!;
    expect(regex).toContain("(^|[^A-Za-z0-9])CN\\-2291\\-X([^A-Za-z0-9]|$)");
  });

  it("reaches chunks with no vector by keyword, and only those", async () => {
    pgvector = true;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const results = await searchKnowledgeBaseChunks("kb", "escalation matrix", 5, 0.3);
    expect(results.map((r) => r.id)).toEqual(["no-vector"]);
    const lexical = seen.find((s) => s.includes("to_tsquery"))!;
    expect(lexical).toContain("c.embedding IS NULL");
    expect(lexical).toContain("escalation | matrix");
  });
});

describe("without pgvector", () => {
  it("ranks by keyword instead of returning the newest chunks", async () => {
    pgvector = false;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const results = await searchKnowledgeBaseChunks("kb", "escalation matrix", 5, 0.3);
    expect(results.map((r) => r.id)).toEqual(["no-vector"]);
    expect(results[0].similarity).toBeNull();
    const lexical = seen.find((s) => s.includes("to_tsquery"))!;
    expect(lexical).not.toContain("embedding IS NULL");
  });

  it("falls back to the newest chunks only when no word matches", async () => {
    pgvector = false;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const results = await searchKnowledgeBaseChunks("kb", "zebra", 5, 0.3);
    expect(results.map((r) => r.id)).toEqual(["recent"]);
  });
});

describe("when the embedding provider fails", () => {
  it("returns the unrestricted keyword matches", async () => {
    pgvector = true;
    embedControl.fail = true;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const results = await searchKnowledgeBaseChunks("kb", "escalation matrix", 5, 0.3);
    expect(results.map((r) => r.id)).toEqual(["no-vector"]);
    const lexical = seen.filter((s) => s.includes("to_tsquery"));
    expect(lexical.length).toBeGreaterThan(0);
    expect(lexical.every((s) => !s.includes("embedding IS NULL"))).toBe(true);
  });

  it("still fails when keyword search fails too", async () => {
    pgvector = true;
    embedControl.fail = true;
    embedControl.failLexical = true;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    await expect(searchKnowledgeBaseChunks("kb", "escalation matrix", 5, 0.3)).rejects.toThrow(/lexical down/);
  });

  it("trims a merged result to the safe topK even when the caller asks for more", async () => {
    pgvector = true;
    const many = (prefix: string) => Array.from({ length: 40 }, (_, i) => row(`${prefix}-${i}`, `${prefix} text ${i}`));
    execute.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      seen.push(text);
      if (/CREATE EXTENSION/i.test(text)) return { rows: [] };
      if (/information_schema/i.test(text)) return { rows: [{ column_name: "embedding" }] };
      if (text.includes("~*") || /productId/.test(text)) return { rows: many("exact") };
      if (text.includes("<=>")) return { rows: many("vector") };
      if (text.includes("to_tsquery")) return { rows: many("word") };
      return { rows: [] };
    });
    vi.resetModules();
    const { searchKnowledgeBaseChunks, normalizeRetrievalRequest } = await import("../server/embeddings");
    const { knowledgeLimits } = await import("../server/config");
    const results = await searchKnowledgeBaseChunks("kb", "escalation matrix", 10_000, 0.3);
    expect(results).toHaveLength(knowledgeLimits.retrievalMaxTopK);
    expect(seen.some((s) => s.includes(`LIMIT ${knowledgeLimits.retrievalMaxTopK}`))).toBe(true);
    expect(seen.some((s) => s.includes("LIMIT 10000"))).toBe(false);
    expect(() => normalizeRetrievalRequest({ query: "hi", topK: 10_000 })).toThrow(/topK/);
    expect(() => normalizeRetrievalRequest({ query: "x".repeat(knowledgeLimits.retrievalMaxQueryChars + 1) })).toThrow(/too long/);
    expect(() => normalizeRetrievalRequest({ query: "hi", scoreThreshold: 1 })).toThrow(/scoreThreshold/);
    expect(normalizeRetrievalRequest({ query: " hi ", topK: 4, scoreThreshold: 0 }).topK).toBe(4);
  });

  it("embeds only the leading characters when a non-HTTP caller passes a long prompt", async () => {
    pgvector = true;
    vi.resetModules();
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const { knowledgeLimits } = await import("../server/config");
    await searchKnowledgeBaseChunks("kb", `escalation ${"x".repeat(knowledgeLimits.retrievalMaxQueryChars)}`, 5, 0.3);
    expect(embedControl.embeddedChars[0]).toBe(knowledgeLimits.retrievalMaxQueryChars);
  });
});
