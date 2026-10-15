/**
 * A query that is a stored product id returns that row even when vector
 * similarity is below the threshold. A descriptive question still goes
 * through semantic search.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY = "test-key-not-used";
});

const execute = vi.hoisted(() => vi.fn());

vi.mock("../server/db", () => ({ db: { execute }, pool: { on: () => {} } }));
vi.mock("../server/permissions", () => ({
  getAllowedKbSensitivityLevels: () => ["public", "internal"],
}));
vi.mock("openai", () => ({
  default: class OpenAI {
    embeddings = {
      create: async ({ input }: { input: string[] }) => ({
        data: input.map(() => ({ embedding: [0.1, 0.2, 0.3] })),
      }),
    };
  },
}));

const { searchKnowledgeBaseChunks } = await import("../server/embeddings");

function sqlText(node: unknown): string {
  const parts: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === "string" || typeof n === "number") {
      parts.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (typeof n !== "object") return;
    const name = n.constructor?.name;
    if (name === "StringChunk" && Array.isArray(n.value)) {
      parts.push(n.value.join(""));
      return;
    }
    if (name === "Param") {
      parts.push(String(n.value));
      return;
    }
    if (Array.isArray(n.queryChunks)) n.queryChunks.forEach(walk);
  };
  walk(node);
  return parts.join("");
}

const PRODUCT_ID = "SKU-PAST-5000";
const exactRow = {
  id: "chunk-late",
  content: "Sheet: Catalog\nProduct ID: SKU-PAST-5000\nName: Far Catalog Item",
  similarity: null,
  metadata: { productId: PRODUCT_ID, sheet: "Catalog", rowNumber: 5201 },
  source_id: "src-1",
  chunk_index: 5199,
  source_name: "catalog.xlsx",
  source_url: null,
};
const semanticRow = {
  id: "chunk-semantic",
  content: "A commercial outdoor widget rated for kitchens.",
  similarity: 0.62,
  metadata: {},
  source_id: "src-1",
  chunk_index: 3,
  source_name: "catalog.xlsx",
  source_url: null,
};

let mode: "exact" | "descriptive" = "exact";
let vectorQueries = 0;

beforeEach(() => {
  vectorQueries = 0;
  execute.mockImplementation(async (query: unknown) => {
    const text = sqlText(query);
    if (/information_schema/i.test(text)) return { rows: [{ column_name: "embedding" }] };
    if (/productId/i.test(text)) {
      return { rows: mode === "exact" ? [exactRow] : [] };
    }
    if (text.includes("<=>")) {
      vectorQueries += 1;
      return { rows: mode === "descriptive" ? [semanticRow] : [] };
    }
    return { rows: [] };
  });
});

describe("searchKnowledgeBaseChunks product id lookup", () => {
  it("returns the row when the query is exactly that product id and vector similarity is below the threshold", async () => {
    mode = "exact";
    const results = await searchKnowledgeBaseChunks("kb-1", PRODUCT_ID, 5, 0.3);
    expect(vectorQueries).toBeGreaterThan(0);
    expect(results.map((row) => row.id)).toContain("chunk-late");
    const hit = results.find((row) => row.id === "chunk-late");
    expect(hit?.content).toContain(PRODUCT_ID);
    expect(hit?.content).toContain("Far Catalog Item");
    expect(hit?.metadata?.productId).toBe(PRODUCT_ID);
  });

  it("uses semantic search for a descriptive query", async () => {
    mode = "descriptive";
    const results = await searchKnowledgeBaseChunks(
      "kb-1",
      "which outdoor widgets are rated for commercial kitchens",
      5,
      0.3,
    );
    expect(vectorQueries).toBeGreaterThan(0);
    expect(results.map((row) => row.id)).toEqual(["chunk-semantic"]);
    expect(results[0].content).toContain("commercial outdoor widget");
    expect(results.some((row) => row.id === "chunk-late")).toBe(false);
  });
});
