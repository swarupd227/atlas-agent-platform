/**
 * A retrieval representation must say what content, and which version, it
 * represents (design section 6f, part A).
 *
 * knowledge_chunks held `content` and a vector and nothing tying them
 * together: no hash of the embedded text, no record of which model produced
 * the vector. So three different facts rendered identically --
 *
 *   - this chunk has no vector,
 *   - this vector matches the text beside it,
 *   - this vector was computed from text that has since changed.
 *
 * That is why the 2026-09-19 incident, where every embedding on Azure was
 * found NULL, is still recorded as "cause unknown": nothing in the rows could
 * separate "never embedded" from "re-embedded" from "stale".
 *
 * These tests are about that separation, not about the columns existing.
 */
import { describe, it, expect, vi } from "vitest";

// embeddings.ts constructs an OpenAI client and touches the db at import time;
// neither is needed for the pure functions under test.
vi.mock("../server/db", () => ({ db: { execute: vi.fn() } }));
vi.mock("../server/permissions", () => ({ getAllowedKbSensitivityLevels: () => [] }));

const { chunkContentHash, chunkVectorState, EMBEDDING_MODEL, MAX_EMBEDDING_INPUT_CHARS } =
  await import("../server/embeddings");

describe("chunkContentHash", () => {
  it("is stable for the same text and different for changed text", () => {
    expect(chunkContentHash("the treaty limit is 50M")).toBe(chunkContentHash("the treaty limit is 50M"));
    expect(chunkContentHash("the treaty limit is 50M")).not.toBe(chunkContentHash("the treaty limit is 60M"));
  });

  it("notices a change of one character, which a length or token count would not", () => {
    const a = chunkContentHash("bound and active");
    const b = chunkContentHash("bound and inactive");
    expect(a).not.toBe(b);
    // The cheap alternatives that would have missed it.
    expect("bound and active".length).not.toBe("bound and inactive".length); // length does catch this one
    expect(chunkContentHash("abc")).not.toBe(chunkContentHash("acb")); // ...but not a reordering
  });

  it("hashes what the model actually saw, not what we meant it to see", () => {
    // generateEmbeddings truncates at MAX_EMBEDDING_INPUT_CHARS, so hashing the
    // untruncated text would describe a vector that was never computed from it:
    // every oversized chunk would read as permanently stale.
    const long = "x".repeat(MAX_EMBEDDING_INPUT_CHARS + 500);
    const truncated = long.slice(0, MAX_EMBEDDING_INPUT_CHARS);
    expect(chunkContentHash(long)).toBe(chunkContentHash(truncated));
  });
});

describe("chunkVectorState separates what used to render identically", () => {
  const text = "Coastal property TIV of 72.4M against a 50M treaty limit.";
  const current = { content: text, contentHash: chunkContentHash(text), embeddingModel: EMBEDDING_MODEL };

  it("a vector matching its text is current", () => {
    expect(chunkVectorState(current, true)).toBe("current");
  });

  it("no vector is 'never_embedded', not 'stale'", () => {
    expect(chunkVectorState(current, false)).toBe("never_embedded");
  });

  it("a vector whose text has since changed is 'stale'", () => {
    const edited = { ...current, content: text.replace("50M", "60M") };
    expect(chunkVectorState(edited, true)).toBe("stale");
  });

  it("a vector from another model is 'model_changed', even when the text matches", () => {
    const old = { ...current, embeddingModel: "text-embedding-ada-002" };
    expect(chunkVectorState(old, true)).toBe("model_changed");
  });

  it("a vector stored before these columns is 'unattributed', NOT 'current'", () => {
    // The judgement call this whole change is about. There is no evidence
    // either way for a pre-existing row, and answering "current" would be a
    // fabricated reassurance -- the same defect as a pass rate defaulting to 0.
    const legacy = { content: text, contentHash: null, embeddingModel: null };
    expect(chunkVectorState(legacy, true)).toBe("unattributed");
    expect(chunkVectorState(legacy, true)).not.toBe("current");
  });

  it("answers the question that could not be asked before the incident", () => {
    // Given a mixed set, which chunks can be trusted, which need re-embedding,
    // and which we simply do not know about? Previously all five rows looked
    // the same from the outside.
    const rows = [
      { label: "fresh", chunk: current, hasVector: true },
      { label: "edited", chunk: { ...current, content: text + " Amended." }, hasVector: true },
      { label: "wiped", chunk: current, hasVector: false },
      { label: "old model", chunk: { ...current, embeddingModel: "ada" }, hasVector: true },
      { label: "pre-column", chunk: { content: text, contentHash: null, embeddingModel: null }, hasVector: true },
    ];
    expect(rows.map(r => chunkVectorState(r.chunk, r.hasVector))).toEqual([
      "current", "stale", "never_embedded", "model_changed", "unattributed",
    ]);
  });
});

describe("the write path cannot forget to attribute", () => {
  it("storeChunkEmbedding requires the text the vector came from", async () => {
    // A stamp applied at each call site is the shape that let `?? 0` reach
    // fourteen readers of a pass rate. The signature is the enforcement: this
    // reads the source, because a type error is not observable at runtime.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "..", "server", "embeddings.ts"), "utf8");
    expect(src).toContain("export async function storeChunkEmbedding(chunkId: string, embedding: number[], text: string)");
    // And it writes all three, not just the vector.
    const fn = src.slice(src.indexOf("export async function storeChunkEmbedding"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    for (const col of ["content_hash", "embedding_model", "embedded_at"]) {
      expect(body, col).toContain(col);
    }
  });

  it("every caller passes the embedded text, not the stored row's content", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "..", "server", "kb-routes.ts"), "utf8");
    const calls = src.match(/storeChunkEmbedding\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      // Three arguments: a two-argument call would not compile, but it would
      // also mean someone had widened the signature back to optional.
      expect(c.split(",").length, c).toBe(3);
    }
  });

  it("the model is a named constant, not a literal inside the request", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "..", "server", "embeddings.ts"), "utf8");
    expect(src).toContain("export const EMBEDDING_MODEL");
    expect(src).toContain("model: EMBEDDING_MODEL,");
    // The literal may appear once, where the constant is defined, and nowhere else.
    expect((src.match(/"text-embedding-3-small"/g) ?? []).length).toBe(1);
  });
});

/**
 * The surfaces that answer "what state are these embeddings in".
 *
 * Adding the columns was not the capability. /embedding-status existed
 * precisely to answer this question and could only count vectors, so a base
 * whose text had all changed since embedding reported "fully embedded",
 * identically to one that was current. Only one of those means search works.
 */
describe("embedding-status reports what the vectors ARE", () => {
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const src = readFileSync(join(__dirname, "..", "server", "kb-routes.ts"), "utf8");
  const statusRoute = src.slice(src.indexOf('app.get("/api/knowledge-bases/:id/embedding-status"'));
  const body = statusRoute.slice(0, statusRoute.indexOf("\n  });"));

  it("classifies every chunk rather than counting vectors", () => {
    expect(body).toContain("chunkVectorState");
    expect(body).toContain("states[chunkVectorState");
  });

  it("keeps the three keys existing callers read", () => {
    // knowledge-base-detail.tsx consumes these; widening a response must not
    // break the page that already reads it.
    for (const k of ["total", "withEmbeddings", "withoutEmbeddings"]) expect(body).toContain(k);
  });

  it("counts vectors in ONE query, not one per chunk", () => {
    expect(body).not.toMatch(/for \(const chunk of chunks\)[\s\S]{0,200}db\.execute/);
    expect(body).toContain("WHERE knowledge_base_id =");
  });
});

describe("re-embedding stale or unattributed vectors is opt-in", () => {
  const { readFileSync } = require("fs");
  const { join } = require("path");
  const src = readFileSync(join(__dirname, "..", "server", "kb-routes.ts"), "utf8");
  const embedRoute = src.slice(src.indexOf('app.post("/api/knowledge-bases/:id/embed"'));
  const body = embedRoute.slice(0, embedRoute.indexOf("\n  });"));

  it("defaults to chunks with no vector, so nobody re-embeds the platform by accident", () => {
    // The cost is real: widening the default would re-embed every chunk the
    // first time anyone pressed the button.
    expect(body).toContain('const include = String((req.query.include ?? "")).toLowerCase()');
    expect(body).toContain('const wantStale = include === "stale" || include === "all"');
    expect(body).toContain('const wantUnattributed = include === "unattributed" || include === "all"');
    expect(body).toContain('if (state === "never_embedded") missingChunks.push(chunk)');
  });

  it("does not report 'all chunks already have embeddings' when they are stale or unattributed", () => {
    // True and misleading is the failure mode this whole layer is about.
    expect(body).toContain("would be re-embedded with include=all");
    expect(body).toContain("states: skipped");
  });

  it("checks which chunks have a vector in one query", () => {
    expect(body).not.toMatch(/for \(const chunk of chunks\) \{\s*const check = await db\.execute/);
  });
});
