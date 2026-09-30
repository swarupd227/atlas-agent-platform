/**
 * A knowledge search that threw is not an empty one.
 *
 * searchKnowledgeBaseChunks throws when the embeddings provider is down, out
 * of credit or not configured. Both run paths carry on without it; before this
 * a Workspace run then reported zero knowledge bases searched, which is what
 * an agent with nothing linked reports, and a deployed agent's run swapped in
 * its most recent passages without a word. These pin the record of the
 * failure (shared/knowledge-search-failure.ts), that one failing knowledge
 * base no longer hides the others, and that each surface says what happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("../server/embeddings", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  searchKnowledgeBaseChunks: (...args: unknown[]) => search(...args),
}));
vi.mock("../server/retrieval-rerank", () => ({ rerankChunks: async (_question: string, chunks: unknown[]) => chunks }));

import { storage } from "../server/storage";
import { buildKbContext, measureContextUsage } from "../server/workspace-run";
import { contextProof } from "../server/astra/tools/run-agent";
import { searchFailureReason, knowledgeFailureNote, type KnowledgeSearchFailure } from "../shared/knowledge-search-failure";

const NO_CREDITS = "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.";
const names: Record<string, string> = { "kb-claims": "Claims manual", "kb-rates": "Rate tables" };
const link = (knowledgeBaseId: string) => ({ id: `l-${knowledgeBaseId}`, agentId: "agent-1", knowledgeBaseId, retrievalConfig: { topK: 5, scoreThreshold: 0.3 } });
const base = { instructions: "You underwrite.", knowledge: "", skillCatalog: "", request: "What is the rate?", attachments: "", brandAssets: "" };

let links: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  search.mockReset();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  links = vi.spyOn(storage, "getAgentKnowledgeBases").mockResolvedValue([link("kb-claims"), link("kb-rates")] as never);
  vi.spyOn(storage, "getKnowledgeBase").mockImplementation((async (id: string) => ({ id, name: names[id] })) as never);
});

describe("searchFailureReason", () => {
  it("keeps the first sentence and drops the link", () => {
    expect(searchFailureReason(new Error(NO_CREDITS))).toBe("429 You have no credits remaining.");
  });

  it("never repeats anything key-shaped", () => {
    const reason = searchFailureReason(new Error("Incorrect API key provided: sk-proj-abc123DEF456ghi. You can find your API key at https://platform.openai.com/account/api-keys."));
    expect(reason).toBe("Incorrect API key provided: [redacted].");
    expect(reason).not.toContain("abc123");
  });

  it("has words for an error that has none, and a cap for one that has too many", () => {
    expect(searchFailureReason(undefined)).toBe("The search did not run.");
    expect(searchFailureReason(new Error("   "))).toBe("The search did not run.");
    expect(searchFailureReason("connect ETIMEDOUT")).toBe("connect ETIMEDOUT");
    const long = searchFailureReason(new Error("x".repeat(400)));
    expect(long).toHaveLength(160);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("knowledgeFailureNote", () => {
  const failure = (over: Partial<KnowledgeSearchFailure> = {}): KnowledgeSearchFailure => ({ knowledgeBaseId: "kb-claims", name: "Claims manual", reason: "429 You have no credits remaining.", fallback: "none", ...over });

  it("says nothing when nothing failed", () => {
    expect(knowledgeFailureNote([])).toBe("");
    expect(knowledgeFailureNote(undefined)).toBe("");
  });

  it("says how many, why, and what the run did instead", () => {
    expect(knowledgeFailureNote([failure()])).toBe("Knowledge search failed for 1 knowledge base: 429 You have no credits remaining. The run went on without that knowledge.");
    expect(knowledgeFailureNote([failure({ fallback: "recent_passages" }), failure({ knowledgeBaseId: "kb-rates", fallback: "recent_passages" })]))
      .toBe("Knowledge search failed for 2 knowledge bases: 429 You have no credits remaining. The most recent passages were used instead, chosen by date and not by relevance.");
    expect(knowledgeFailureNote([failure({ fallback: "recent_passages" }), failure({ knowledgeBaseId: "kb-rates", reason: "connect ETIMEDOUT" })]))
      .toBe("Knowledge search failed for 2 knowledge bases: 429 You have no credits remaining. / connect ETIMEDOUT. 1 of them used the most recent passages instead, chosen by date and not by relevance.");
  });

  it("does not count knowledge bases when retrieval failed before reaching one", () => {
    expect(knowledgeFailureNote([failure({ knowledgeBaseId: null, name: null, reason: "connection refused" })]))
      .toBe("Knowledge retrieval failed before any knowledge base was searched: connection refused. The run went on without that knowledge.");
  });
});

describe("a Workspace run's retrieval", () => {
  it("keeps the other knowledge base's passages when one search throws", async () => {
    search.mockImplementation(async (kbId: string) => {
      if (kbId === "kb-claims") throw new Error(NO_CREDITS);
      return [{ id: "c1", content: "Coastal wind rate is 1.8 per cent.", similarity: 0.74 }, { id: "c2", content: "Inland rate is 0.6 per cent.", similarity: 0.51 }];
    });
    const kb = await buildKbContext("agent-1", "What is the rate?", undefined, "org-1");
    expect(kb.searched).toBe(1);
    expect(kb.failures).toEqual([{ knowledgeBaseId: "kb-claims", name: "Claims manual", reason: "429 You have no credits remaining.", fallback: "none" }]);
    expect(kb.retrievals).toEqual([expect.objectContaining({ knowledgeBaseId: "kb-rates", name: "Rate tables", passages: 2, topSimilarity: 0.74 })]);
    expect(kb.section).toContain("Coastal wind rate is 1.8 per cent.");
  });

  it("reports every search that threw, and does not pass for an agent with nothing linked", async () => {
    search.mockRejectedValue(new Error(NO_CREDITS));
    const kb = await buildKbContext("agent-1", "What is the rate?", undefined, "org-1");
    expect(kb).toMatchObject({ section: "", searched: 0, retrievals: [] });
    expect(kb.failures.map((f) => f.knowledgeBaseId)).toEqual(["kb-claims", "kb-rates"]);

    const usage = measureContextUsage({ ...base, knowledge: kb.section, knowledgeSearched: kb.searched, retrievals: kb.retrievals, failures: kb.failures });
    expect(usage.knowledgeFailed).toEqual(kb.failures);
    const proof = contextProof(usage);
    expect(proof.summary).toContain("knowledge search failed for 2 knowledge bases (429 You have no credits remaining)");
    expect(proof.summary).not.toContain("no knowledge base linked");
  });

  it("still tells nothing linked from nothing matched, with no failure on either", async () => {
    search.mockResolvedValue([]);
    const matched = await buildKbContext("agent-1", "What is the rate?", undefined, "org-1");
    expect(matched).toMatchObject({ section: "", searched: 2, failures: [] });
    const usage = measureContextUsage({ ...base, knowledge: "", knowledgeSearched: matched.searched, retrievals: matched.retrievals, failures: matched.failures });
    expect(usage).not.toHaveProperty("knowledgeFailed");
    expect(contextProof(usage).summary).toContain("2 knowledge bases searched, nothing relevant found");

    links.mockResolvedValue([] as never);
    const unlinked = await buildKbContext("agent-1", "What is the rate?", undefined, "org-1");
    expect(unlinked).toEqual({ section: "", searched: 0, retrievals: [], failures: [] });
    expect(search).toHaveBeenCalledTimes(2);
    expect(contextProof(measureContextUsage({ ...base, knowledgeSearched: 0, retrievals: [], failures: [] })).summary).toContain("no knowledge base linked");
  });

  it("records a failure when the agent's links cannot be read at all", async () => {
    links.mockRejectedValue(new Error("connection refused"));
    const kb = await buildKbContext("agent-1", "What is the rate?", undefined, "org-1");
    expect(kb.failures).toEqual([{ knowledgeBaseId: null, name: null, reason: "connection refused", fallback: "none" }]);
    expect(search).not.toHaveBeenCalled();
    expect(contextProof(measureContextUsage({ ...base, knowledgeSearched: 0, retrievals: [], failures: kb.failures })).summary).toContain("knowledge search failed (connection refused)");
  });
});

describe("contextProof", () => {
  it("says what was used and what failed when both happened", () => {
    const proof = contextProof({
      layers: [{ layer: "system_prompt", tokens: 1200 }],
      totalTokens: 1500,
      knowledgeSearched: 1,
      knowledge: [{ knowledgeBaseId: "kb-rates", name: "Rate tables", passages: 3, tokens: 300, topSimilarity: 0.74 }],
      knowledgeFailed: [{ knowledgeBaseId: "kb-claims", name: "Claims manual", reason: "429 You have no credits remaining.", fallback: "none" }],
    });
    expect(proof).toEqual({ status: "measured", summary: "1,500 tokens of context · 3 passages from 1 knowledge base, knowledge search failed for 1 knowledge base (429 You have no credits remaining)" });
  });
});

describe("the deployed agent's run", () => {
  const src = read("server", "agent-runtime.ts");

  it("records the search that threw before it tries the recency fallback", () => {
    expect(src).toContain("} catch (searchErr: unknown) {");
    expect(src).toContain("kbSearchFailures.push(failure);");
    expect(src.indexOf("kbSearchFailures.push(failure);")).toBeLessThan(src.indexOf("storage.getKnowledgeChunks(link.knowledgeBaseId),"));
  });

  it("marks the passages it used instead as a fallback, on the failure and on the retrieval", () => {
    expect(src).toContain('failure.fallback = "recent_passages";');
    expect(src).toContain('fallback: "recent_passages",\n              searchError: failure.reason,');
  });

  it("no longer swallows a retrieval error without a trace", () => {
    expect(src).not.toContain("} catch {}\n\n  const toolSchemaText");
    expect(src).toContain("if (kbSearchFailures.length === 0) kbSearchFailures.push({ knowledgeBaseId: null, name: null, reason: searchFailureReason(kbErr), fallback: \"none\" });");
  });

  it("adds a step that says so without failing the run, and keeps it in the provenance", () => {
    const step = src.slice(src.indexOf("if (kbSearchFailures.length > 0) {"), src.indexOf("const toolSchemaText = availableTools.length > 0"));
    expect(step).toContain('type: "knowledge_retrieval",');
    expect(step).toContain('status: "completed",');
    expect(step).not.toContain('status: "failed"');
    expect(step).toContain("output: { note: knowledgeFailureNote(kbSearchFailures), failures: kbSearchFailures },");
    expect(src).toContain("...(kbSearchFailures.length > 0 ? { kbSearchFailures } : {}),");
  });
});

describe("the views", () => {
  it("the run card shows the failure, and never 'no knowledge base is linked' beside it", () => {
    const pane = read("client", "src", "astra", "artifact-pane.tsx");
    expect(pane).toContain('data-testid="knowledge-search-failed">{knowledgeFailureNote(failed)}</p>');
    expect(pane).toContain("{knowledge.length === 0 && (failed.length === 0 || context.knowledgeSearched > 0) && (");
  });

  it("the trace shows the failure without being opened, and a fallback passage has no similarity", () => {
    const trace = read("client", "src", "pages", "trace-detail.tsx");
    expect(trace).toContain("{(kbRetrievals.length > 0 || kbSearchFailures.length > 0) && (");
    expect(trace.indexOf('data-testid="kb-search-failures"')).toBeLessThan(trace.indexOf('{expandedSections.has("kb") && ('));
    expect(trace).toContain('{kbr.fallback ? "recent passages, search failed" : kbr.embeddingModel}');
    expect(trace).toContain('{chunk.similarityScore == null ? "n/a" : (chunk.similarityScore * 100).toFixed(0) + "%"}');
  });
});
