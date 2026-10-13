/**
 * Which model makes document-search vectors, and the move from one to another (server/embedding-backend.ts): the active model and
 * what happens when its setting is missing or unreadable, making vectors with either provider, and the re-embed / stop / resume /
 * switch / switch-back logic, run against an in-memory store so that no database or AWS is needed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = new Map<string, { key: string; value: string }>();
vi.mock("../server/storage", () => ({
  storage: {
    getPlatformSetting: async (key: string) => settings.get(key),
    upsertPlatformSetting: async (s: { key: string; value: string }) => { settings.set(s.key, s); return s; },
    getLlmProviderKey: async () => null,
  },
}));
vi.mock("../server/db", () => ({ db: { execute: vi.fn() } }));

import {
  MAX_EMBEDDING_INPUT_CHARS, MIGRATION_STALE_MS, SearchSwitchError, bedrockTarget, configuredBedrockTarget, currentMigration, embedWith,
  emptyMigration, getActiveEmbedding, invalidateActiveEmbedding, modelKeyOf, openAiTarget, requestStop, runMigration, setActiveEmbedding,
  startMigration, switchActive, targetFromRecord, EMBEDDING_ACTIVE_KEY,
  type EmbeddingTarget, type MigrationDeps, type MigrationStatus, type VectorStore,
} from "../server/embedding-backend";
import { parseBedrockConfig, invalidateBedrockConfig, BEDROCK_SETTING_KEY } from "../server/bedrock-config";
import { BedrockError } from "../server/bedrock-client";

const bedrock = () => bedrockTarget({ modelId: "amazon.titan-embed-text-v2:0", family: "titan", dimensions: 1024 });
const reply = (obj: unknown) => ({ body: new TextEncoder().encode(JSON.stringify(obj)) });

beforeEach(() => { settings.clear(); invalidateActiveEmbedding(); invalidateBedrockConfig(); });

describe("the targets", () => {
  it("OpenAI is the model every existing vector was made with, in the legacy store", () => {
    const t = openAiTarget();
    expect(t).toMatchObject({ provider: "openai", modelId: "text-embedding-3-small", dimensions: 1536, store: "legacy", stamp: "text-embedding-3-small" });
  });

  it("a Bedrock model keeps its vectors apart, named by model and size", () => {
    const t = bedrock();
    expect(t.store).toBe("vectors");
    expect(t.modelKey).toBe("aws_bedrock:amazon.titan-embed-text-v2:0:1024");
    expect(t.stamp).toBe(t.modelKey);
    expect(modelKeyOf("aws_bedrock", "m", 512)).not.toBe(modelKeyOf("aws_bedrock", "m", 1024));
  });

  it("describes the saved Bedrock settings, or says why there is nothing to move to", () => {
    expect(configuredBedrockTarget(parseBedrockConfig({}))).toMatchObject({ ok: false, reason: expect.stringMatching(/switched off/) });
    expect(configuredBedrockTarget(parseBedrockConfig({ enabled: true, region: "eu-central-1" }))).toMatchObject({ ok: false });
    const ok = configuredBedrockTarget(parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: { modelId: "amazon.titan-embed-text-v1" } } }));
    expect(ok).toMatchObject({ ok: true, row: { modelId: "amazon.titan-embed-text-v1", family: "titan", dimensions: null } });
  });
});

describe("the active model", () => {
  it("is OpenAI until someone switches", async () => {
    expect((await getActiveEmbedding()).provider).toBe("openai");
  });

  it("never guesses: a Bedrock record without a size, or one that cannot be read, means OpenAI", async () => {
    expect(targetFromRecord({ provider: "aws_bedrock", modelId: "m" }).provider).toBe("openai");
    expect(targetFromRecord(null).provider).toBe("openai");
    settings.set(EMBEDDING_ACTIVE_KEY, { key: EMBEDDING_ACTIVE_KEY, value: "{ not json" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getActiveEmbedding()).provider).toBe("openai");
    spy.mockRestore();
  });

  it("changes when switched, and records who did it and when", async () => {
    await setActiveEmbedding(bedrock(), "alice");
    const rec = JSON.parse(settings.get(EMBEDDING_ACTIVE_KEY)!.value);
    expect(rec).toMatchObject({ provider: "aws_bedrock", modelId: "amazon.titan-embed-text-v2:0", dimensions: 1024, switchedBy: "alice" });
    expect(Date.parse(rec.switchedAt)).toBeGreaterThan(0);
    expect(await getActiveEmbedding()).toMatchObject({ provider: "aws_bedrock", modelKey: bedrock().modelKey });
    await setActiveEmbedding(openAiTarget(), "alice");
    expect((await getActiveEmbedding()).provider).toBe("openai");
  });
});

describe("making vectors", () => {
  it("OpenAI: passes the texts through, cut to the longest an input may be", async () => {
    const seen: string[][] = [];
    const out = await embedWith(openAiTarget(), ["a", "b".repeat(MAX_EMBEDDING_INPUT_CHARS + 50)], "document", { openAi: async (t) => { seen.push(t); return t.map(() => [1]); } });
    expect(out).toEqual([[1], [1]]);
    expect(seen[0][0]).toBe("a");
    expect(seen[0][1]).toHaveLength(MAX_EMBEDDING_INPUT_CHARS);
  });

  it("Bedrock: refused when Bedrock is switched off, with words an administrator can act on", async () => {
    await expect(embedWith(bedrock(), ["x"], "document", { bedrockSender: { send: async () => reply({}) } })).rejects.toMatchObject({ problem: { code: "disabled" } });
  });

  it("Bedrock: uses the saved connection and the active model's own size, and tells a question from a passage (Cohere)", async () => {
    settings.set(BEDROCK_SETTING_KEY, { key: BEDROCK_SETTING_KEY, value: JSON.stringify(parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: { modelId: "cohere.embed-multilingual-v3", dimensions: 8 } } })) });
    const cohere = bedrockTarget({ modelId: "cohere.embed-multilingual-v3", family: "cohere", dimensions: 8 });
    const eight = [1, 2, 3, 4, 5, 6, 7, 8];
    const sent: any[] = [];
    const sender = { send: async (cmd: any) => { sent.push(JSON.parse(cmd.input.body)); return reply({ embeddings: [eight] }); } };
    expect(await embedWith(cohere, ["what is x"], "query", { bedrockSender: sender })).toEqual([eight]);
    await embedWith(cohere, ["a passage"], "document", { bedrockSender: sender });
    expect(sent.map((b) => b.input_type)).toEqual(["search_query", "search_document"]);
  });

  it("Bedrock: refuses vectors of a size other than the one the stored vectors have", async () => {
    settings.set(BEDROCK_SETTING_KEY, { key: BEDROCK_SETTING_KEY, value: JSON.stringify(parseBedrockConfig({ enabled: true, region: "eu-central-1", models: { embedding: { modelId: "amazon.titan-embed-text-v1" } } })) });
    const t = bedrockTarget({ modelId: "amazon.titan-embed-text-v1", family: "titan", dimensions: 1536 });
    await expect(embedWith(t, ["x"], "document", { bedrockSender: { send: async () => reply({ embedding: [1, 2, 3] }) } })).rejects.toBeInstanceOf(BedrockError);
  });
});

// ── the move, against an in-memory store ──────────────────────────────────────────────────────────────────────────

function world(chunks: Array<{ id: string; content: string }>) {
  const vectors = new Map<string, Map<string, number[]>>(); // modelKey -> chunk id -> vector
  const saved: Array<{ key: string; id: string; text: string }> = [];
  const store: VectorStore = {
    async coverage(t) { return { total: chunks.length, covered: vectors.get(t.modelKey)?.size ?? 0 }; },
    async missing(t, limit, exclude) { const have = vectors.get(t.modelKey); return chunks.filter((c) => !have?.has(c.id) && !exclude.includes(c.id)).slice(0, limit); },
    async save(t, id, v, text) { if (!vectors.has(t.modelKey)) vectors.set(t.modelKey, new Map()); vectors.get(t.modelKey)!.set(id, v); saved.push({ key: t.modelKey, id, text }); },
  };
  let status: MigrationStatus = emptyMigration();
  let clock = Date.parse("2026-10-12T12:00:00Z");
  const writes: MigrationStatus[] = [];
  let embedImpl: MigrationDeps["embed"] = async (_t, texts) => texts.map((x) => [x.length]);
  const deps: MigrationDeps = {
    store,
    embed: (t, texts, kind) => embedImpl(t, texts, kind),
    readStatus: async () => status,
    writeStatus: async (s) => { status = s; writes.push(s); },
    now: () => clock,
  };
  return { deps, vectors, saved, writes, setEmbed: (f: MigrationDeps["embed"]) => { embedImpl = f; }, tick: (ms: number) => { clock += ms; }, status: () => status, setStatus: (s: MigrationStatus) => { status = s; } };
}
const five = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, content: `passage ${i}` }));

describe("re-embedding", () => {
  it("gives every passage a vector, a batch at a time, reporting as it goes", async () => {
    const w = world(five);
    const end = await runMigration(w.deps, bedrock(), "alice", 2);
    expect(end).toMatchObject({ state: "done", total: 5, covered: 5, startedBy: "alice", targetKey: bedrock().modelKey });
    expect(w.vectors.get(bedrock().modelKey)!.size).toBe(5);
    expect(w.saved.every((s) => s.key === bedrock().modelKey)).toBe(true);
    expect(w.saved.find((s) => s.id === "c3")!.text).toBe("passage 3");
    const progress = w.writes.filter((s) => s.state === "running").map((s) => s.covered);
    expect(progress).toEqual([0, 2, 4, 5]);
  });

  it("does not loop on a passage with no text: it is skipped and said so", async () => {
    const w = world([...five.slice(0, 2), { id: "blank", content: "   " }]);
    const end = await runMigration(w.deps, bedrock(), null, 5);
    expect(end).toMatchObject({ state: "done", covered: 2, skipped: 1 });
  });

  it("stops when asked, and carries on from where it was when started again", async () => {
    const w = world(five);
    let calls = 0;
    w.setEmbed(async (_t, texts) => { if (++calls === 1) w.setStatus({ ...w.status(), state: "stopping" }); return texts.map(() => [1]); });
    const stopped = await runMigration(w.deps, bedrock(), "alice", 2);
    expect(stopped.state).toBe("stopped");
    expect(stopped.covered).toBe(2);
    w.setEmbed(async (_t, texts) => texts.map(() => [1]));
    const resumed = await runMigration(w.deps, bedrock(), "alice", 2);
    expect(resumed).toMatchObject({ state: "done", covered: 5 });
    expect(w.saved.filter((s) => s.id === "c0")).toHaveLength(1); // nothing embedded twice
  });

  it("fails with the words of the problem, and keeps what it had done", async () => {
    const w = world(five);
    let n = 0;
    w.setEmbed(async (_t, texts) => { if (++n === 2) throw new BedrockError({ code: "throttled", message: "Bedrock is limiting requests.", hint: "Lower 'Requests at once'." }); return texts.map(() => [1]); });
    const end = await runMigration(w.deps, bedrock(), null, 2);
    expect(end.state).toBe("failed");
    expect(end.lastError).toContain("Bedrock is limiting requests.");
    expect(end.lastError).toContain("Lower 'Requests at once'.");
    expect(end.covered).toBe(2);
  });

  it("notices a model that returns the wrong number of vectors", async () => {
    const w = world(five);
    w.setEmbed(async () => [[1]]);
    expect((await runMigration(w.deps, bedrock(), null, 3)).state).toBe("failed");
  });
});

describe("starting, stopping and the status", () => {
  it("refuses a second run while one is alive, but not one that died with its server", async () => {
    const w = world(five);
    w.setStatus({ ...emptyMigration(), state: "running", updatedAt: new Date(w.deps.now()).toISOString(), targetKey: "x" });
    await expect(startMigration(w.deps, bedrock(), "bob", () => {})).rejects.toBeInstanceOf(SearchSwitchError);
    w.tick(MIGRATION_STALE_MS + 1000);
    expect((await currentMigration(w.deps)).state).toBe("interrupted");
    const queued: Promise<unknown>[] = [];
    const started = await startMigration(w.deps, bedrock(), "bob", (p) => queued.push(p));
    expect(started.state).toBe("running");
    await Promise.all(queued);
    expect(w.status().state).toBe("done");
  });

  it("answers at once when there is nothing to do", async () => {
    const w = world(five);
    await runMigration(w.deps, bedrock(), null, 10);
    const again = await startMigration(w.deps, bedrock(), "bob", () => { throw new Error("should not start work"); });
    expect(again).toMatchObject({ state: "done", covered: 5 });
  });

  it("asks a running one to stop, and leaves a finished one alone", async () => {
    const w = world(five);
    w.setStatus({ ...emptyMigration(), state: "running", updatedAt: new Date(w.deps.now()).toISOString() });
    expect((await requestStop(w.deps)).state).toBe("stopping");
    w.setStatus({ ...emptyMigration(), state: "done" });
    expect((await requestStop(w.deps)).state).toBe("done");
  });
});

describe("switching", () => {
  const io = () => { const calls: string[] = []; return { calls, io: { probe: async (t: EmbeddingTarget) => { calls.push(`probe ${t.provider}`); }, setActive: async (t: EmbeddingTarget) => { calls.push(`set ${t.provider}`); } } }; };

  it("is refused while any passage lacks a vector for the model, and says how many", async () => {
    const w = world(five);
    await w.deps.store.save(bedrock(), "c0", [1], "x");
    const c = io();
    await expect(switchActive(w.deps, bedrock(), "alice", c.io)).rejects.toThrow(/4 of 5 passages/);
    expect(c.calls).toEqual([]);
  });

  it("is refused while a re-embedding is running", async () => {
    const w = world(five);
    w.setStatus({ ...emptyMigration(), state: "running", updatedAt: new Date(w.deps.now()).toISOString() });
    await expect(switchActive(w.deps, bedrock(), "alice", io().io)).rejects.toBeInstanceOf(SearchSwitchError);
  });

  it("proves the model answers before it changes anything, and changes nothing if it does not", async () => {
    const w = world(five);
    await runMigration(w.deps, bedrock(), null, 10);
    const calls: string[] = [];
    await expect(switchActive(w.deps, bedrock(), "alice", { probe: async () => { throw new Error("no access"); }, setActive: async () => { calls.push("set"); } })).rejects.toThrow("no access");
    expect(calls).toEqual([]);
    const c = io();
    const done = await switchActive(w.deps, bedrock(), "alice", c.io);
    expect(c.calls).toEqual(["probe aws_bedrock", "set aws_bedrock"]);
    expect(done.coverage).toEqual({ total: 5, covered: 5 });
  });

  it("switching back works the same way, and the old vectors are still there", async () => {
    const w = world(five);
    await runMigration(w.deps, bedrock(), null, 10);
    await runMigration(w.deps, openAiTarget(), null, 10);
    expect(w.vectors.size).toBe(2);
    const c = io();
    await switchActive(w.deps, openAiTarget(), "alice", c.io);
    expect(c.calls).toEqual(["probe openai", "set openai"]);
    expect(w.vectors.get(bedrock().modelKey)!.size).toBe(5);
  });

  it("an empty library can switch at once", async () => {
    const w = world([]);
    const c = io();
    await switchActive(w.deps, bedrock(), "alice", c.io);
    expect(c.calls).toHaveLength(2);
  });
});
