/**
 * END-TO-END against a real Postgres with pgvector. Opt-in: skipped unless
 * KB_E2E_DATABASE_URL points at a THROWAWAY database whose schema was pushed
 * (it creates and deletes knowledge bases). For example:
 *
 *   docker run -d --rm --name atlas-kb-e2e-pg -p 55432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=kbe2e pgvector/pgvector:pg16
 *   docker exec atlas-kb-e2e-pg psql -U postgres -d kbe2e -c "CREATE EXTENSION IF NOT EXISTS vector;"
 *   DATABASE_URL=postgres://postgres:test@localhost:55432/kbe2e npx drizzle-kit push --force
 *   KB_E2E_DATABASE_URL=postgres://postgres:test@localhost:55432/kbe2e npx vitest run --config vitest.integration.config.ts tests/kb-pgvector-e2e.test.ts
 *
 * REAL: the database, pgvector, the stored original file, extraction,
 * chunking, batched inserts, vector storage and search SQL.
 * MOCKED: only the OpenAI embedding endpoint, replaced by a deterministic
 * bag-of-words embedding so similarity is meaningful and failures can be
 * injected per batch.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const E2E_URL = vi.hoisted(() => {
  const url = process.env.KB_E2E_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  process.env.OPENAI_API_KEY ||= "test-key-not-used";
  return url;
});

const embedControl = vi.hoisted(() => ({ fail: null as null | ((texts: string[]) => boolean), requests: 0 }));

vi.mock("openai", () => {
  const DIM = 1536;
  const embed = (text: string): number[] => {
    const v = new Array<number>(DIM).fill(0);
    for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
      let h = 2166136261;
      for (let i = 0; i < w.length; i++) h = Math.imul(h ^ w.charCodeAt(i), 16777619);
      v[Math.abs(h) % DIM] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  };
  class OpenAI {
    embeddings = {
      create: async ({ input }: { input: string[] | string }) => {
        const texts = Array.isArray(input) ? input : [input];
        embedControl.requests++;
        if (embedControl.fail?.(texts)) throw Object.assign(new Error("injected 503 from the embedding endpoint"), { status: 503 });
        return { data: texts.map((t, index) => ({ embedding: embed(t), index })) };
      },
    };
    chat = { completions: { create: async () => { throw new Error("no chat in this test"); } } };
  }
  return { default: OpenAI, OpenAI };
});

describe.skipIf(!E2E_URL)("Knowledge Base indexing and retrieval, end to end (real pgvector)", () => {
  const created: string[] = [];

  afterAll(async () => {
    if (!E2E_URL) return;
    const { storage } = await import("../server/storage");
    for (const id of created) await storage.deleteKnowledgeBase(id).catch(() => {});
    const { pool } = await import("../server/db");
    await pool.end().catch(() => {});
  });

  let orgId: string | undefined;
  async function setup(name: string) {
    const { storage } = await import("../server/storage");
    if (!orgId) {
      const { db } = await import("../server/db");
      const { organizations } = await import("@shared/schema");
      const [org] = await db.insert(organizations).values({ name: "kb-e2e", slug: `kb-e2e-${Date.now()}` }).returning();
      orgId = org.id;
    }
    const kb = await storage.createKnowledgeBase({ name, industry: "general", chunkSize: 512, chunkOverlap: 50, organizationId: orgId } as any);
    created.push(kb.id);
    return { storage, kb };
  }

  it("indexes every row of a 6,200-row workbook from its stored file and finds the last one by id and by meaning", async () => {
    const { largeXlsx } = await import("./support/large-documents");
    const { processSourceInBackground, saveSourceFile } = await import("../server/kb-routes");
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const { storage, kb } = await setup("e2e-workbook");

    const lateId = "QX-7781-B";
    const buffer = await largeXlsx({ rows: 6_200, idHeader: "Part Number", lateId, lateText: "zygomorphic quetzal hinge", descriptionChars: 110, sheetName: "Parts" });
    const source = await storage.createKnowledgeSource({ knowledgeBaseId: kb.id, name: "parts.xlsx", sourceType: "document", status: "pending", content: "", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as any);
    expect(await saveSourceFile(source.id, { buffer, originalname: "parts.xlsx", mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: buffer.length })).toBe(true);

    embedControl.fail = null;
    await processSourceInBackground(source.id, kb.id);

    const done = await storage.getKnowledgeSource(source.id);
    expect(done?.status).toBe("processed");
    expect(done?.chunkCount).toBe(6_200);
    expect((done?.metadata as any).indexingReport).toMatchObject({ from: "original_file", chunks: 6_200, embedded: 6_200, complete: true });

    const byId = await searchKnowledgeBaseChunks(kb.id, lateId, 5, 0.3);
    expect(byId[0].content).toContain(`Part Number: ${lateId}`);
    expect(byId[0].metadata).toMatchObject({ key: lateId, sheet: "Parts", rowNumber: 6_201 });

    const byMeaning = await searchKnowledgeBaseChunks(kb.id, "zygomorphic quetzal hinge", 5, 0.3);
    expect(byMeaning.some((r) => r.content.includes(lateId) && typeof r.similarity === "number")).toBe(true);
  }, 300_000);

  it("marks a source partial when an embedding batch keeps failing, still finds those passages by keyword, and recovers on reprocess", async () => {
    const { largePdf } = await import("./support/large-documents");
    const { processSourceInBackground, saveSourceFile } = await import("../server/kb-routes");
    const { searchKnowledgeBaseChunks } = await import("../server/embeddings");
    const { storage, kb } = await setup("e2e-pdf");

    const buffer = await largePdf({ pages: 40, charsPerPage: 4_000, marker: "zygomorphic quetzal appendix" });
    const source = await storage.createKnowledgeSource({ knowledgeBaseId: kb.id, name: "manual.pdf", sourceType: "document", status: "pending", content: "", mimeType: "application/pdf" } as any);
    await saveSourceFile(source.id, { buffer, originalname: "manual.pdf", mimetype: "application/pdf", size: buffer.length });

    embedControl.fail = (texts) => texts.some((t) => t.includes("zygomorphic"));
    await processSourceInBackground(source.id, kb.id);
    const partial = await storage.getKnowledgeSource(source.id);
    expect(partial?.status).toBe("partial");
    expect(partial?.errorMessage).toMatch(/passages have no vector/);
    const report = (partial?.metadata as any).indexingReport;
    expect(report.embeddingFailed).toBeGreaterThan(0);
    expect(report.embedded + report.embeddingFailed).toBe(report.chunks);

    // The provider is back for the question itself; the failed passages still have no vector.
    embedControl.fail = null;
    const found = await searchKnowledgeBaseChunks(kb.id, "zygomorphic quetzal", 5, 0.3);
    const hit = found.find((r) => r.content.includes("zygomorphic"));
    expect(hit).toBeDefined();
    expect(hit!.metadata.page).toBe(40);
    expect(hit!.similarity).toBeNull();

    await storage.deleteKnowledgeChunksBySource(source.id);
    await processSourceInBackground(source.id, kb.id, true);
    const recovered = await storage.getKnowledgeSource(source.id);
    expect(recovered?.status).toBe("processed");
    expect(recovered?.errorMessage).toBeNull();
  }, 300_000);

  it("deletes the stored original file with its source", async () => {
    const { saveSourceFile } = await import("../server/kb-routes");
    const { db } = await import("../server/db");
    const { knowledgeSourceFiles } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const { storage, kb } = await setup("e2e-delete");
    const source = await storage.createKnowledgeSource({ knowledgeBaseId: kb.id, name: "a.txt", sourceType: "document", status: "pending", content: "hi" } as any);
    await saveSourceFile(source.id, { buffer: Buffer.from("hi"), originalname: "a.txt", mimetype: "text/plain", size: 2 });
    expect(await db.select().from(knowledgeSourceFiles).where(eq(knowledgeSourceFiles.sourceId, source.id))).toHaveLength(1);
    await storage.deleteKnowledgeSource(source.id);
    expect(await db.select().from(knowledgeSourceFiles).where(eq(knowledgeSourceFiles.sourceId, source.id))).toHaveLength(0);
  });
});
