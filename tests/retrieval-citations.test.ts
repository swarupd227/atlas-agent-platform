/**
 * Retrieved passages carry where they came from.
 *
 * Both retrieval paths had the provenance in hand and dropped it: the queries
 * select `source_id` and `chunk_index`, the agent path even recorded a
 * `sourceDocId` per chunk, and the model was shown bare text. An agent asked to
 * cite could then only omit the citations or invent them, and an invented
 * citation naming a real document survives every check that looks only at form.
 *
 * These tests assert on the text that is actually built and on the source the
 * two call sites were edited into -- a retrieval test that passes on an empty
 * result set is the usual way this kind of change looks finished without being it,
 * so every case here has passages in it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { citePassages, excerptOf, CITATION_RULE } from "../shared/retrieval-citations";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const CHUNKS = [
  { id: "c1", content: "Retention is seven years for signed contracts.", source_id: "src-1", chunk_index: 3, source_name: "Retention Policy 2026", source_url: "https://example.com/retention", similarity: 0.82 },
  { id: "c2", content: "Drafts may be deleted after ninety days.", source_id: "src-1", chunk_index: 4, source_name: "Retention Policy 2026", source_url: "https://example.com/retention", similarity: 0.71 },
  { id: "c3", content: "Exports require a named approver.", source_id: "src-2", chunk_index: 0, source_name: "Export Controls", similarity: 0.66 },
];

describe("labelling retrieved passages", () => {
  it("gives every passage its own label, and the text keeps the passage", () => {
    const { text, sources } = citePassages(CHUNKS);
    expect(sources.map((s) => s.label)).toEqual(["S1", "S2", "S3"]);
    expect(text).toContain("[S1] Retention Policy 2026 · chunk 3");
    expect(text).toContain("Retention is seven years for signed contracts.");
    expect(text).toContain("[S3] Export Controls · chunk 0");
  });

  it("labels two passages from one document separately, since a citation is to a passage", () => {
    const { sources } = citePassages(CHUNKS);
    expect(sources[0].sourceId).toBe("src-1");
    expect(sources[1].sourceId).toBe("src-1");
    expect(sources[0].chunkIndex).toBe(3);
    expect(sources[1].chunkIndex).toBe(4);
  });

  it("carries the link when the source has one and omits it when it does not", () => {
    const { sources, text } = citePassages(CHUNKS);
    expect(sources[0].url).toBe("https://example.com/retention");
    expect(sources[2].url).toBeUndefined();
    expect(text).toContain("https://example.com/retention");
  });

  it("continues the numbering across knowledge bases, so one label means one passage", () => {
    const first = citePassages([CHUNKS[0]], { kbName: "A" });
    const second = citePassages([CHUNKS[2]], { kbName: "B", startAt: first.sources.length + 1 });
    expect(first.sources[0].label).toBe("S1");
    expect(second.sources[0].label).toBe("S2");
  });

  it("names the source even when the row has no name, rather than labelling it blank", () => {
    const fromMetadata = citePassages([{ content: "x", source_id: "s", chunk_index: 1, metadata: { fileName: "handbook.pdf" } }]);
    expect(fromMetadata.sources[0].title).toBe("handbook.pdf");
    const fromKb = citePassages([{ content: "x", source_id: "s", chunk_index: 1 }], { kbName: "Policies" });
    expect(fromKb.sources[0].title).toBe("Policies");
    const fromId = citePassages([{ content: "x", source_id: "src-9" }]);
    expect(fromId.sources[0].title).toBe("src-9");
  });

  it("reads either spelling of the provenance fields, because the two paths differ", () => {
    const snake = citePassages([{ content: "x", source_id: "s1", chunk_index: 2 }]);
    const camel = citePassages([{ content: "x", sourceId: "s1", chunkIndex: 2 }]);
    expect(snake.sources[0].sourceId).toBe(camel.sources[0].sourceId);
    expect(snake.sources[0].chunkIndex).toBe(camel.sources[0].chunkIndex);
  });

  it("keeps the index small: an excerpt, not the passage", () => {
    const long = "word ".repeat(200);
    const { sources } = citePassages([{ content: long, source_id: "s", chunk_index: 0 }]);
    expect(sources[0].excerpt.length).toBeLessThan(200);
    expect(sources[0].excerpt.endsWith("…")).toBe(true);
    expect(excerptOf("  a   b \n c ")).toBe("a b c");
  });

  it("says nothing when there is nothing, rather than inventing a label", () => {
    const { text, sources } = citePassages([]);
    expect(sources).toEqual([]);
    expect(text).toBe("");
  });

  it("tells the model to cite only what is listed", () => {
    expect(CITATION_RULE).toContain("[S1]");
    expect(CITATION_RULE).toMatch(/never cite a label that is not in the list/i);
    // Saying "the passages do not answer this" has to be an option, or the rule
    // pushes the model toward citing something irrelevant.
    expect(CITATION_RULE).toMatch(/say that plainly/i);
  });
});

describe("the query returns what a citation needs", () => {
  const embeddings = read("server", "embeddings.ts");

  it("selects the source name and link on both paths, not just the vector one", () => {
    // The fallback path runs when pgvector is unavailable. If only one path
    // carried provenance, citations would silently depend on infrastructure.
    expect(embeddings.match(/s\.name as source_name, s\.url as source_url/g) ?? []).toHaveLength(2);
  });

  it("declares the provenance columns it has always returned", () => {
    // The columns were in both SELECTs already; the declared type was narrower,
    // which is why every caller dropped them.
    for (const field of ["source_id: string | null", "chunk_index: number | null", "source_name: string | null", "source_url: string | null"]) {
      expect(embeddings).toContain(field);
    }
  });
});

describe("the index reaches the step that writes the report", () => {
  const engine = read("server", "dag-execution-engine.ts");
  const runtime = read("server", "agent-runtime.ts");

  it("is owned and visible, or buildAgentInput would filter it out", () => {
    // Owned but not visible is the silent failure: the key exists on the
    // producing step and is stripped from every downstream prompt.
    expect(engine).toContain("owned.add(`${nc.stateKey}${KB_SOURCES_STATE_SUFFIX}`)");
    expect(engine).toContain("visible.add(`${key}${KB_SOURCES_STATE_SUFFIX}`)");
  });

  it("is written by the knowledge-base step beside its labelled content", () => {
    expect(engine).toContain("const cited = citePassages(chunks, { kbName: kb.name })");
    expect(engine).toContain("${cited.text}");
    expect(engine).toContain("[`${nc.stateKey}${KB_SOURCES_STATE_SUFFIX}`]: cited.sources");
  });

  it("is written for an agent step too, including when it found nothing", () => {
    // Empty array = searched and found nothing; absent = nothing to search.
    expect(runtime).toContain("...(hasKnowledgeBases ? { retrievedSources: citedSources } : {})");
    expect(engine).toContain("...(workerResult.retrievedSources ? { [`${nc.stateKey}${KB_SOURCES_STATE_SUFFIX}`]: workerResult.retrievedSources } : {})");
  });

  it("labels the passages an agent reads on both the reranked and fallback paths", () => {
    expect(runtime.match(/citePassages\(/g) ?? []).toHaveLength(2);
    expect(runtime).not.toContain("${chunks.map((c: any) => c.content).join");
    expect(runtime).not.toContain("${selectedFallback.map((c: any) => c.content).join");
  });

  it("appends the citation rule where the retrieval block is assembled", () => {
    expect(runtime).toContain("${CITATION_RULE}`;");
  });
});
