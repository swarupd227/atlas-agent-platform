/**
 * Which model makes the platform's document-search vectors, where those vectors live, and how to move from one model to another
 * without a gap in search.
 *
 * - The ACTIVE target is the model that search and new documents use. Until an administrator switches it, it is OpenAI's
 *   text-embedding-3-small, whose vectors sit in knowledge_chunks.embedding exactly as before ("legacy" store).
 * - Any other model keeps its vectors in knowledge_chunk_vectors, one row per chunk and model, so models of different sizes live
 *   side by side. A vector is only ever compared with vectors of the same model key.
 * - Moving to another model is three separate acts: re-embed every chunk in the background (search is untouched), switch once
 *   every chunk has a vector (one setting changes), and, if needed, switch back (the old vectors were never removed).
 *
 * The provider calls and the database are passed in where the logic is worth testing without them (see MigrationDeps).
 */
import { openAiClient } from "./ai-egress";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "./db";
import { storage } from "./storage";
import { loadBedrockConfig, isBedrockConfigured, embeddingFamilyOf, type BedrockConfig, type EmbeddingFamily } from "./bedrock-config";
import { BedrockError, embedTexts, explainBedrockError, looksLikeAwsError, runtimeFor, type BedrockSender, type EmbeddingKind } from "./bedrock-client";

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = 1536;
/** Inputs longer than this are cut: a model rejects an input over its limit, and one such input fails the whole batch. */
export const MAX_EMBEDDING_INPUT_CHARS = 20_000;
const clip = (t: string) => (t.length > MAX_EMBEDDING_INPUT_CHARS ? t.slice(0, MAX_EMBEDDING_INPUT_CHARS) : t);

export type EmbeddingProviderId = "openai" | "aws_bedrock";

export interface EmbeddingTarget {
  provider: EmbeddingProviderId;
  modelId: string;
  family?: EmbeddingFamily;
  dimensions: number;
  /** Names the vectors: only vectors with the same key are compared. */
  modelKey: string;
  /** What a chunk's own record says it was embedded with (knowledge_chunks.embedding_model). */
  stamp: string;
  /** For people. */
  label: string;
  /** "legacy": knowledge_chunks.embedding. "vectors": knowledge_chunk_vectors. */
  store: "legacy" | "vectors";
}

export const modelKeyOf = (provider: EmbeddingProviderId, modelId: string, dimensions: number) => `${provider}:${modelId}:${dimensions}`;

export function openAiTarget(): EmbeddingTarget {
  return {
    provider: "openai", modelId: OPENAI_EMBEDDING_MODEL, dimensions: OPENAI_EMBEDDING_DIMENSIONS,
    modelKey: modelKeyOf("openai", OPENAI_EMBEDDING_MODEL, OPENAI_EMBEDDING_DIMENSIONS),
    stamp: OPENAI_EMBEDDING_MODEL, label: `OpenAI ${OPENAI_EMBEDDING_MODEL}`, store: "legacy",
  };
}

export function bedrockTarget(row: { modelId: string; family?: EmbeddingFamily; dimensions: number }): EmbeddingTarget {
  const key = modelKeyOf("aws_bedrock", row.modelId, row.dimensions);
  return { provider: "aws_bedrock", modelId: row.modelId, family: row.family, dimensions: row.dimensions, modelKey: key, stamp: key, label: `Amazon Bedrock ${row.modelId} (${row.dimensions})`, store: "vectors" };
}

/** The Bedrock target the saved settings describe, or why there is none. Dimensions are null until they are known. */
export function configuredBedrockTarget(config: BedrockConfig): { ok: true; row: { modelId: string; family?: EmbeddingFamily; dimensions: number | null } } | { ok: false; reason: string } {
  if (!config.enabled) return { ok: false, reason: "Amazon Bedrock is switched off." };
  if (!isBedrockConfigured(config)) return { ok: false, reason: "Choose a region and a model first." };
  const row = config.models.embedding;
  if (!row) return { ok: false, reason: "No model is set for document search." };
  return { ok: true, row: { modelId: row.modelId, family: embeddingFamilyOf(row) ?? undefined, dimensions: row.dimensions ?? null } };
}

// ── which target is active ────────────────────────────────────────────────────────────────────────────────────────

export const EMBEDDING_ACTIVE_KEY = "embedding_active";

interface ActiveRecord {
  provider: EmbeddingProviderId;
  modelId?: string;
  family?: EmbeddingFamily;
  dimensions?: number;
  switchedAt?: string;
  switchedBy?: string;
}

let activeCache: { at: number; value: EmbeddingTarget } | null = null;
const ACTIVE_CACHE_MS = 10_000;
export function invalidateActiveEmbedding(): void { activeCache = null; }

export function targetFromRecord(rec: ActiveRecord | null | undefined): EmbeddingTarget {
  if (rec?.provider === "aws_bedrock" && rec.modelId && typeof rec.dimensions === "number" && rec.dimensions > 0) {
    return bedrockTarget({ modelId: rec.modelId, family: rec.family, dimensions: rec.dimensions });
  }
  return openAiTarget();
}

export async function getActiveEmbedding(): Promise<EmbeddingTarget> {
  if (activeCache && Date.now() - activeCache.at < ACTIVE_CACHE_MS) return activeCache.value;
  let value: EmbeddingTarget;
  try {
    const row = await storage.getPlatformSetting(EMBEDDING_ACTIVE_KEY);
    value = targetFromRecord(row?.value ? JSON.parse(row.value) : null);
  } catch (err: any) {
    // Unreadable: the model every existing vector was made with, never a guess.
    console.error(`[embeddings] the active-model setting could not be read, using OpenAI: ${String(err?.message ?? err).slice(0, 200)}`);
    value = openAiTarget();
  }
  activeCache = { at: Date.now(), value };
  return value;
}

export async function setActiveEmbedding(target: EmbeddingTarget, by: string | undefined): Promise<void> {
  const rec: ActiveRecord = { provider: target.provider, modelId: target.modelId, family: target.family, dimensions: target.dimensions, switchedAt: new Date().toISOString(), switchedBy: by };
  await storage.upsertPlatformSetting({ key: EMBEDDING_ACTIVE_KEY, value: JSON.stringify(rec), category: "ai", description: "The model that makes document-search vectors (Model Providers page, Amazon Bedrock card)." });
  invalidateActiveEmbedding();
}

// ── making vectors ───────────────────────────────────────────────────────────────────────────────────────────────

export function isOpenAiEmbeddingConfigured(): boolean { return !!process.env.OPENAI_API_KEY; }

async function openAiEmbed(texts: string[]): Promise<number[][]> {
  // Refused when AWS only is on; built on first use otherwise.
  const client = await openAiClient("Document search through OpenAI");
  const out: number[][] = [];
  const batchSize = 100;
  for (let i = 0; i < texts.length; i += batchSize) {
    const response = await client.embeddings.create({ model: OPENAI_EMBEDDING_MODEL, input: texts.slice(i, i + batchSize) });
    out.push(...response.data.map((d) => d.embedding));
  }
  return out;
}

export interface EmbedDeps { bedrockSender?: BedrockSender; openAi?: (texts: string[]) => Promise<number[][]> }

/** Vectors for the given texts with the given model, in order. `kind` matters to Cohere: a stored passage and a question differ. */
export async function embedWith(target: EmbeddingTarget, texts: string[], kind: EmbeddingKind = "document", deps: EmbedDeps = {}): Promise<number[][]> {
  const clipped = texts.map(clip);
  if (target.provider === "openai") return (deps.openAi ?? openAiEmbed)(clipped);
  const { config } = await loadBedrockConfig();
  if (!config.enabled) {
    throw new BedrockError({ code: "disabled", message: "Amazon Bedrock is switched off.", hint: "Switch it on on the Model Providers page, or switch document search back to OpenAI." });
  }
  const sender = deps.bedrockSender ?? (await runtimeFor(config));
  const { vectors, dimensions } = await embedTexts(sender, { modelId: target.modelId, family: target.family, dimensions: target.dimensions }, clipped, kind, config.limits);
  if (vectors.length && dimensions !== target.dimensions) {
    throw new BedrockError({ code: "dimension_mismatch", message: `The model returned vectors of ${dimensions} numbers, not ${target.dimensions}.`, hint: "The settings for this model changed since the vectors were planned. Start the re-embedding again." });
  }
  return vectors;
}

/** One real call to learn the size of this model's vectors (Titan G1 and Cohere are fixed but the settings may not say so). */
export async function probeDimensions(row: { modelId: string; family?: EmbeddingFamily }, deps: EmbedDeps = {}): Promise<number> {
  const { config } = await loadBedrockConfig();
  const sender = deps.bedrockSender ?? (await runtimeFor(config));
  const { dimensions } = await embedTexts(sender, { modelId: row.modelId, family: row.family }, ["Connection test."], "document", config.limits);
  return dimensions;
}

export const embeddingAvailable = async (): Promise<boolean> => {
  const active = await getActiveEmbedding();
  if (active.provider === "openai") return isOpenAiEmbeddingConfigured();
  const { config } = await loadBedrockConfig();
  return isBedrockConfigured(config);
};

// ── the stores ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface VectorStore {
  coverage(t: EmbeddingTarget): Promise<{ total: number; covered: number }>;
  /** Chunks with no vector for this target, except those named (blank chunks that cannot be embedded). */
  missing(t: EmbeddingTarget, limit: number, exclude: string[]): Promise<Array<{ id: string; content: string }>>;
  save(t: EmbeddingTarget, chunkId: string, vector: number[], text: string): Promise<void>;
}

export const chunkTextHash = (text: string) => createHash("sha256").update(clip(text), "utf8").digest("hex");
const vecLiteral = (v: number[]) => `[${v.join(",")}]`;

let vectorTableReady: Promise<void> | null = null;
export function ensureVectorTable(): Promise<void> {
  if (!vectorTableReady) {
    vectorTableReady = (async () => {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS knowledge_chunk_vectors (
          chunk_id VARCHAR NOT NULL REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
          model_key TEXT NOT NULL,
          embedding vector NOT NULL,
          content_hash TEXT,
          embedded_at TIMESTAMP NOT NULL DEFAULT NOW(),
          PRIMARY KEY (chunk_id, model_key)
        )`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_vectors_model ON knowledge_chunk_vectors (model_key)`);
    })().catch((e) => { vectorTableReady = null; throw e; });
  }
  return vectorTableReady;
}

async function ready(t: EmbeddingTarget): Promise<void> {
  const { ensurePgVector } = await import("./embeddings"); // lazily: embeddings.ts imports this module
  if (!(await ensurePgVector())) throw new Error("The vector database (pgvector) is not available.");
  if (t.store === "vectors") await ensureVectorTable();
}

export const pgVectorStore: VectorStore = {
  async coverage(t) {
    await ready(t);
    const total = Number(((await db.execute(sql`SELECT COUNT(*)::int AS n FROM knowledge_chunks`)).rows[0] as any)?.n ?? 0);
    const covered = t.store === "legacy"
      ? Number(((await db.execute(sql`SELECT COUNT(*)::int AS n FROM knowledge_chunks WHERE embedding IS NOT NULL`)).rows[0] as any)?.n ?? 0)
      : Number(((await db.execute(sql`SELECT COUNT(*)::int AS n FROM knowledge_chunk_vectors WHERE model_key = ${t.modelKey}`)).rows[0] as any)?.n ?? 0);
    return { total, covered };
  },
  async missing(t, limit, exclude) {
    await ready(t);
    const skip = exclude.length ? sql`AND c.id NOT IN (${sql.join(exclude.map((id) => sql`${id}`), sql`, `)})` : sql``;
    const rows = t.store === "legacy"
      ? await db.execute(sql`SELECT c.id, c.content FROM knowledge_chunks c WHERE c.embedding IS NULL ${skip} ORDER BY c.id LIMIT ${limit}`)
      : await db.execute(sql`
          SELECT c.id, c.content FROM knowledge_chunks c
          WHERE NOT EXISTS (SELECT 1 FROM knowledge_chunk_vectors v WHERE v.chunk_id = c.id AND v.model_key = ${t.modelKey}) ${skip}
          ORDER BY c.id LIMIT ${limit}`);
    return (rows.rows ?? []) as Array<{ id: string; content: string }>;
  },
  async save(t, chunkId, vector, text) {
    await ready(t);
    const literal = vecLiteral(vector);
    const hash = chunkTextHash(text);
    if (t.store === "legacy") {
      await db.execute(sql`UPDATE knowledge_chunks SET embedding = ${literal}::vector, content_hash = ${hash}, embedding_model = ${t.stamp}, embedded_at = NOW() WHERE id = ${chunkId}`);
    } else {
      await db.execute(sql`
        INSERT INTO knowledge_chunk_vectors (chunk_id, model_key, embedding, content_hash, embedded_at)
        VALUES (${chunkId}, ${t.modelKey}, ${literal}::vector, ${hash}, NOW())
        ON CONFLICT (chunk_id, model_key) DO UPDATE SET embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash, embedded_at = NOW()`);
    }
  },
};

/** What each chunk of one knowledge base has, in the target's store. */
export async function vectorFacts(kbId: string, t: EmbeddingTarget): Promise<Map<string, { hasVector: boolean; contentHash: string | null; embeddingModel: string | null }>> {
  await ready(t);
  const rows = t.store === "legacy"
    ? await db.execute(sql`SELECT id, embedding IS NOT NULL AS has, content_hash AS hash, embedding_model AS model FROM knowledge_chunks WHERE knowledge_base_id = ${kbId}`)
    : await db.execute(sql`
        SELECT c.id, v.chunk_id IS NOT NULL AS has, v.content_hash AS hash, v.model_key AS model
        FROM knowledge_chunks c LEFT JOIN knowledge_chunk_vectors v ON v.chunk_id = c.id AND v.model_key = ${t.modelKey}
        WHERE c.knowledge_base_id = ${kbId}`);
  const out = new Map<string, { hasVector: boolean; contentHash: string | null; embeddingModel: string | null }>();
  for (const r of (rows.rows ?? []) as any[]) out.set(String(r.id), { hasVector: !!r.has, contentHash: r.hash ?? null, embeddingModel: r.model ?? null });
  return out;
}

// ── moving to another model ──────────────────────────────────────────────────────────────────────────────────────

export type MigrationState = "idle" | "running" | "stopping" | "stopped" | "done" | "failed" | "interrupted";

export interface MigrationStatus {
  state: MigrationState;
  targetKey: string | null;
  targetLabel: string | null;
  total: number;
  covered: number;
  skipped: number;
  startedAt: string | null;
  updatedAt: string | null;
  startedBy: string | null;
  lastError: string | null;
}

export const MIGRATION_KEY = "embedding_migration";
/** A run that has not reported for this long is taken to have died with its server. */
export const MIGRATION_STALE_MS = 90_000;
export const emptyMigration = (): MigrationStatus => ({ state: "idle", targetKey: null, targetLabel: null, total: 0, covered: 0, skipped: 0, startedAt: null, updatedAt: null, startedBy: null, lastError: null });

export interface MigrationDeps {
  store: VectorStore;
  embed(target: EmbeddingTarget, texts: string[], kind: EmbeddingKind): Promise<number[][]>;
  readStatus(): Promise<MigrationStatus>;
  writeStatus(s: MigrationStatus): Promise<void>;
  now(): number;
}

export const realMigrationDeps: MigrationDeps = {
  store: pgVectorStore,
  embed: (t, texts, kind) => embedWith(t, texts, kind),
  async readStatus() {
    try {
      const row = await storage.getPlatformSetting(MIGRATION_KEY);
      return row?.value ? { ...emptyMigration(), ...JSON.parse(row.value) } : emptyMigration();
    } catch { return emptyMigration(); }
  },
  async writeStatus(s) {
    await storage.upsertPlatformSetting({ key: MIGRATION_KEY, value: JSON.stringify(s), category: "ai", description: "Progress of re-embedding document-search vectors with another model." });
  },
  now: () => Date.now(),
};

/** The status as a reader should see it: a run that stopped reporting is "interrupted", not "running". */
export async function currentMigration(deps: MigrationDeps = realMigrationDeps): Promise<MigrationStatus> {
  const s = await deps.readStatus();
  if ((s.state === "running" || s.state === "stopping") && s.updatedAt && deps.now() - Date.parse(s.updatedAt) > MIGRATION_STALE_MS) return { ...s, state: "interrupted" };
  return s;
}

const BATCH = 40;

/**
 * Fills in the vectors a target is missing, a batch at a time, reporting after each batch. It can be stopped (the status
 * becomes "stopping") and resumed (it picks up whatever is still missing). A chunk with no text is counted as skipped.
 */
export async function runMigration(deps: MigrationDeps, target: EmbeddingTarget, startedBy: string | null, batchSize = BATCH): Promise<MigrationStatus> {
  const startedAt = new Date(deps.now()).toISOString();
  const base = { targetKey: target.modelKey, targetLabel: target.label, startedAt, startedBy, lastError: null as string | null };
  const first = await deps.store.coverage(target);
  let status: MigrationStatus = { ...emptyMigration(), ...base, state: "running", total: first.total, covered: first.covered, updatedAt: startedAt };
  await deps.writeStatus(status);
  const skippedIds: string[] = [];
  const report = async (patch: Partial<MigrationStatus>) => {
    // A stop request is written by another request while this one works: a progress report must not erase it.
    const stopAsked = !patch.state && (await deps.readStatus()).state === "stopping";
    status = { ...status, ...patch, ...(stopAsked ? { state: "stopping" as const } : {}), skipped: skippedIds.length, updatedAt: new Date(deps.now()).toISOString() };
    await deps.writeStatus(status);
  };

  try {
    for (;;) {
      if ((await deps.readStatus()).state === "stopping") { await report({ state: "stopped" }); return status; }
      const rows = await deps.store.missing(target, batchSize, skippedIds);
      if (rows.length === 0) { const covered = (await deps.store.coverage(target)).covered; await report({ state: "done", covered }); return status; }
      const usable = rows.filter((r) => (r.content ?? "").trim().length > 0);
      for (const r of rows) if (!(r.content ?? "").trim()) skippedIds.push(r.id);
      if (usable.length) {
        const vectors = await deps.embed(target, usable.map((r) => r.content), "document");
        if (vectors.length !== usable.length) throw new Error(`The model returned ${vectors.length} vectors for ${usable.length} passages`);
        for (let i = 0; i < usable.length; i++) await deps.store.save(target, usable[i].id, vectors[i], usable[i].content);
      }
      await report({ covered: status.covered + usable.length });
    }
  } catch (err: any) {
    const problem = err instanceof BedrockError ? err.problem : looksLikeAwsError(err) ? explainBedrockError(err, { modelId: target.modelId, region: "" }) : null;
    const message = problem ? `${problem.message} ${problem.hint}` : String(err?.message ?? err).slice(0, 300);
    await report({ state: "failed", lastError: message });
    return status;
  }
}

export class SearchSwitchError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); this.name = "SearchSwitchError"; }
}

/** Starts a run in the background. Refuses while another is alive; a finished run is simply re-checked. */
export async function startMigration(deps: MigrationDeps, target: EmbeddingTarget, startedBy: string | null, background: (work: Promise<unknown>) => void = (p) => void p.catch(() => {})): Promise<MigrationStatus> {
  const current = await currentMigration(deps);
  if (current.state === "running" || current.state === "stopping") {
    throw new SearchSwitchError("A re-embedding is already running. Wait for it to finish or stop it first.");
  }
  const { total, covered } = await deps.store.coverage(target);
  if (total === covered) {
    const done: MigrationStatus = { ...emptyMigration(), state: "done", targetKey: target.modelKey, targetLabel: target.label, total, covered, startedAt: new Date(deps.now()).toISOString(), updatedAt: new Date(deps.now()).toISOString(), startedBy };
    await deps.writeStatus(done);
    return done;
  }
  const started: MigrationStatus = { ...emptyMigration(), state: "running", targetKey: target.modelKey, targetLabel: target.label, total, covered, startedAt: new Date(deps.now()).toISOString(), updatedAt: new Date(deps.now()).toISOString(), startedBy };
  await deps.writeStatus(started);
  background(runMigration(deps, target, startedBy));
  return started;
}

export async function requestStop(deps: MigrationDeps): Promise<MigrationStatus> {
  const s = await currentMigration(deps);
  if (s.state !== "running") return s;
  const stopping = { ...s, state: "stopping" as const, updatedAt: new Date(deps.now()).toISOString() };
  await deps.writeStatus(stopping);
  return stopping;
}

/**
 * Makes `target` the model search and new documents use. Refused while any chunk lacks a vector for it (search would silently
 * miss those passages), and after one real call proves the model answers.
 */
export async function switchActive(deps: MigrationDeps, target: EmbeddingTarget, by: string | undefined, io: { probe?: (t: EmbeddingTarget) => Promise<void>; setActive?: (t: EmbeddingTarget, by: string | undefined) => Promise<void> } = {}): Promise<{ target: EmbeddingTarget; coverage: { total: number; covered: number } }> {
  const running = await currentMigration(deps);
  if (running.state === "running" || running.state === "stopping") throw new SearchSwitchError("A re-embedding is still running. Wait for it to finish first.");
  const coverage = await deps.store.coverage(target);
  if (coverage.covered < coverage.total) {
    throw new SearchSwitchError(`${coverage.total - coverage.covered} of ${coverage.total} passages have no vector for this model yet. Re-embed first.`);
  }
  await (io.probe ?? (async (t: EmbeddingTarget) => { await embedWith(t, ["probe"], "query"); }))(target);
  await (io.setActive ?? setActiveEmbedding)(target, by);
  return { target, coverage };
}
