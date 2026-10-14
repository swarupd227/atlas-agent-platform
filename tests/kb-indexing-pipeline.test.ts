/**
 * Storing and embedding a large source: bounded batches, retry, partial status.
 *
 * MOCKED: the database (insertChunks/storeEmbedding) and the embedding model
 * are in-memory fakes passed through IndexDeps; the chunker and the status
 * logic are the real ones (server/kb-indexing.ts).
 *
 * Before this, one embedding call covered every chunk of a source; when it
 * failed, every chunk was stored without a vector and the source still said
 * "processed", so semantic search silently could not find any of it.
 */
import { describe, expect, it } from "vitest";
import {
  chunkSections,
  describeIndexing,
  embedBatchWithRetry,
  isPermanentEmbeddingError,
  legacyTruncationGap,
  settleAfterEmbedding,
  storeAndEmbedChunks,
  type IndexDeps,
  type PreparedChunk,
} from "../server/kb-indexing";

function fakeStore() {
  const rows: Array<{ id: string; chunkIndex: number; content: string; metadata: Record<string, unknown> }> = [];
  const vectors = new Map<string, number[]>();
  const inserts: number[] = [];
  const deps: Pick<IndexDeps, "insertChunks" | "storeEmbedding"> = {
    insertChunks: async (batch) => {
      inserts.push(batch.length);
      return batch.map((r) => {
        const id = `c${rows.length}`;
        rows.push({ id, chunkIndex: r.chunkIndex, content: r.content, metadata: r.metadata });
        return { id };
      });
    },
    storeEmbedding: async (id, v) => { vectors.set(id, v); },
  };
  return { rows, vectors, inserts, deps };
}

const chunks = (n: number): PreparedChunk[] =>
  Array.from({ length: n }, (_, i) => ({ content: `row ${i} ITEM-${i}`, metadata: { rowNumber: i + 2 } }));
const noSleep = async () => {};

describe("storeAndEmbedChunks", () => {
  it("stores every chunk in bounded inserts and embeds them in bounded requests", async () => {
    const store = fakeStore();
    const requests: number[] = [];
    const report = await storeAndEmbedChunks({ knowledgeBaseId: "kb", sourceId: "s" }, chunks(1_300), {
      ...store.deps,
      embed: async (texts) => { requests.push(texts.length); return texts.map(() => [1, 0]); },
      sleep: noSleep,
    }, { embedBatch: 64, insertBatch: 512 });

    expect(report).toMatchObject({ chunks: 1_300, chunksStored: 1_300, embedded: 1_300, embeddingFailed: 0, embeddingComplete: true });
    expect(store.inserts).toEqual([512, 512, 276]);
    expect(Math.max(...requests)).toBe(64);
    expect(store.rows.map((r) => r.chunkIndex)).toEqual(Array.from({ length: 1_300 }, (_, i) => i));
    expect(store.vectors.size).toBe(1_300);
    expect(describeIndexing({ report, from: "original_file" }).status).toBe("processed");
  });

  it("retries a transient failure with backoff and loses nothing", async () => {
    const store = fakeStore();
    const waits: number[] = [];
    let calls = 0;
    const report = await storeAndEmbedChunks({ knowledgeBaseId: "kb", sourceId: "s" }, chunks(10), {
      ...store.deps,
      embed: async (texts) => {
        calls++;
        if (calls <= 2) throw Object.assign(new Error("429 rate limited"), { status: 429 });
        return texts.map(() => [1]);
      },
      sleep: async (ms) => { waits.push(ms); },
    }, { embedBatch: 64, baseDelayMs: 500 });
    expect(report.embedded).toBe(10);
    expect(waits).toEqual([500, 1000]);
  });

  it("isolates a batch that keeps failing: its chunks are stored without vectors and the source is partial", async () => {
    const store = fakeStore();
    const report = await storeAndEmbedChunks({ knowledgeBaseId: "kb", sourceId: "s" }, chunks(200), {
      ...store.deps,
      embed: async (texts) => {
        if (texts[0] === "row 64 ITEM-64") throw new Error("upstream 503");
        return texts.map(() => [1]);
      },
      sleep: noSleep,
    }, { embedBatch: 64, retries: 2 });

    expect(report.chunksStored).toBe(200);
    expect(report.embedded).toBe(136);
    expect(report.embeddingFailed).toBe(64);
    expect(report.failedBatches).toBe(1);
    expect(report.embeddingError).toContain("upstream 503");

    const outcome = describeIndexing({ report, from: "original_file" });
    expect(outcome.status).toBe("partial");
    expect(outcome.errorMessage).toContain("64 of 200 passages have no vector");
    expect(outcome.errorMessage).toContain("Generate embeddings");
    expect(outcome.record.readComplete).toBe(true);

    // "Generate embeddings" later fills them in: the source becomes processed.
    const settled = settleAfterEmbedding(outcome.record, 0);
    expect(settled.status).toBe("processed");
    expect(settled.errorMessage).toBeNull();
    expect(settled.record.embedded).toBe(200);
    expect(settled.record.summary).toContain("200 embedded");
    // Some still missing: still partial, with the new count.
    expect(settleAfterEmbedding(outcome.record, 5).errorMessage).toContain("5 of 200 passages");
  });

  it("stops embedding on a permanent error without retrying, and still stores every chunk", async () => {
    const store = fakeStore();
    let calls = 0;
    const report = await storeAndEmbedChunks({ knowledgeBaseId: "kb", sourceId: "s" }, chunks(300), {
      ...store.deps,
      embed: async () => { calls++; throw Object.assign(new Error("Embedding model is switched off"), { code: "disabled" }); },
      sleep: noSleep,
    }, { embedBatch: 64 });
    expect(calls).toBe(1);
    expect(report.chunksStored).toBe(300);
    expect(report.embedded).toBe(0);
    expect(report.embeddingFailed).toBe(300);
    expect(describeIndexing({ report, from: "original_file" }).status).toBe("partial");
  });

  it("treats a short vector list as a failure, not a silent gap", async () => {
    await expect(embedBatchWithRetry(["a", "b"], async () => [[1]], { retries: 0, sleep: noSleep })).rejects.toThrow(/1 vectors for 2 texts/);
  });

  it("reports progress after every stored window", async () => {
    const store = fakeStore();
    const seen: number[] = [];
    await storeAndEmbedChunks({ knowledgeBaseId: "kb", sourceId: "s" }, chunks(1_100), {
      ...store.deps,
      embed: async (t) => t.map(() => [1]),
      progress: (r) => { seen.push(r.chunksStored); },
    }, { insertBatch: 512 });
    expect(seen).toEqual([512, 1024, 1100]);
  });
});

describe("what counts as permanent", () => {
  it("is configuration, not load", () => {
    expect(isPermanentEmbeddingError(Object.assign(new Error("x"), { code: "dimension_mismatch" }))).toBe(true);
    expect(isPermanentEmbeddingError(new Error("Incorrect API key provided"))).toBe(true);
    expect(isPermanentEmbeddingError(new Error("Request timed out"))).toBe(false);
    expect(isPermanentEmbeddingError(new Error("429 Too Many Requests"))).toBe(false);
  });
});

describe("a long row is split into labelled parts instead of being clipped at embedding", () => {
  it("keeps the row's label and number on every part", () => {
    const text = `Sheet: S\nPart Number: P-1\nNotes: ${"y ".repeat(12_000)}`;
    const { chunks: out } = chunkSections([{ text, locator: { sheet: "S", rowNumber: 9, key: "P-1" } }]);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.content.length <= 8_000)).toBe(true);
    expect(out.slice(1).every((c) => c.content.startsWith("Sheet: S (row 9, continued)"))).toBe(true);
    expect(out.every((c) => c.metadata.key === "P-1" && c.metadata.rowNumber === 9)).toBe(true);
  });
});

describe("a source stored by the old extractor", () => {
  it("is recognised as cut, so it is reported partial with a re-upload instruction", () => {
    expect(legacyTruncationGap(`${"a".repeat(100)}\n\n[truncated]`)).toMatch(/Upload the file again/);
    expect(legacyTruncationGap("[truncated: 40 data rows were not indexed. This is not the full workbook.]\n\nrow")).toMatch(/Upload the file again/);
    expect(legacyTruncationGap("an ordinary document")).toBeNull();
  });
});
