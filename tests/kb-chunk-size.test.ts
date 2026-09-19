/**
 * A chunk never ends up far beyond the knowledge base's chunk size: text the
 * sentence splitter can't break (a CSV, one line per row) is split at line
 * breaks, and a single overlong line into pieces. Before this, a CSV upload
 * became one chunk of the whole file -- over the embedding model's 8,192-token
 * limit, so the knowledge base could never be embedded or searched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { splitOversizedChunk } from "../server/kb-routes";

describe("splitOversizedChunk", () => {
  it("leaves a normal chunk alone", () => {
    const chunk = "A normal passage. ".repeat(40).trim();
    expect(splitOversizedChunk(chunk, 512)).toEqual([chunk]);
  });

  it("splits a CSV-like block at line breaks into pieces near the chunk size", () => {
    const rows = Array.from({ length: 2000 }, (_, i) => `2026-09-18T10:${String(i % 60).padStart(2, "0")}:00Z,user-${i},agent.run,completed`);
    const pieces = splitOversizedChunk(rows.join("\n"), 512);
    expect(pieces.length).toBeGreaterThan(100);
    expect(Math.max(...pieces.map((p) => p.length))).toBeLessThanOrEqual(512);
    expect(pieces.join("\n")).toBe(rows.join("\n"));
  });

  it("cuts a single overlong line into chunk-size pieces", () => {
    const line = "x".repeat(5000);
    const pieces = splitOversizedChunk(line, 512);
    expect(pieces.every((p) => p.length <= 512)).toBe(true);
    expect(pieces.join("")).toBe(line);
  });
});

describe("chunkText uses it, and embeddings cap their input", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  it("applies the split to every chunk", () => {
    expect(read("server", "kb-routes.ts")).toContain("return chunks.flatMap((c) => splitOversizedChunk(c, chunkSize));");
  });
  it("never sends the embedding model an input over the cap", () => {
    const src = read("server", "embeddings.ts");
    expect(src).toContain("export const MAX_EMBEDDING_INPUT_CHARS = 20_000;");
    expect(src).toContain("t.length > MAX_EMBEDDING_INPUT_CHARS ? t.slice(0, MAX_EMBEDDING_INPUT_CHARS) : t");
  });
});
