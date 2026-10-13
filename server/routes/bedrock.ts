/**
 * Amazon Bedrock administration (the "Amazon Bedrock" card on the Model Providers page):
 *
 *   GET    /api/admin/bedrock              the settings, where they came from, and whether access keys are saved
 *   PUT    /api/admin/bedrock              save the settings
 *   POST   /api/admin/bedrock/credentials  save access keys (encrypted); optional: without them the server's own AWS role is used
 *   DELETE /api/admin/bedrock/credentials  remove them
 *   POST   /api/admin/bedrock/test         one tiny real call with the saved settings, for one job (embedding, chat or fast)
 *   GET    /api/admin/bedrock/policy       the AWS permissions the saved settings need
 *   GET    /api/admin/bedrock/search           which model document search uses, and how far a move to another model has got
 *   POST   /api/admin/bedrock/search/reembed   compute the missing vectors for a model in the background ({ to: "bedrock" | "openai" })
 *   POST   /api/admin/bedrock/search/stop      stop that run (it can be started again and picks up where it was)
 *   POST   /api/admin/bedrock/search/switch    make that model the one search uses, once every passage has a vector for it
 *
 * These settings apply to the whole deployment, so like the other provider settings they are for the platform's own organization.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { checkPermission, platformOnly } from "../permissions";
import { storage } from "../storage";
import { getDefaultOrgId, getOrgId } from "../auth";
import { LockdownError } from "../lockdown";
import {
  BEDROCK_PURPOSES, SUGGESTED_MODELS, bedrockCredentialStatus, bedrockCredentialsSchema, changedBedrockFields, clearBedrockCredentials,
  effectiveRegion, isBedrockConfigured, loadBedrockConfig, parseBedrockConfig, saveBedrockConfig, saveBedrockCredentials,
} from "../bedrock-config";
import { generateIamPolicy, runtimeFor, testBedrockModel, explainBedrockError, looksLikeAwsError, BedrockError } from "../bedrock-client";
import {
  SearchSwitchError, bedrockTarget, configuredBedrockTarget, currentMigration, getActiveEmbedding, isOpenAiEmbeddingConfigured, openAiTarget,
  pgVectorStore, probeDimensions, realMigrationDeps, requestStop, startMigration, switchActive, type EmbeddingTarget,
} from "../embedding-backend";

const router = Router();

function audit(req: Request, action: string, details: Record<string, unknown>) {
  storage.createAuditEvent({
    organizationId: getOrgId(req) ?? getDefaultOrgId(),
    actorType: "user",
    actorId: (req as any).authUser?.username ?? "unknown",
    action,
    objectType: "bedrock_settings",
    objectId: "bedrock",
    details: JSON.stringify(details),
  }).catch((err: any) => console.error("[bedrock] audit write failed:", err?.message));
}

function zodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.join(".") || "settings"}: ${first.message}` : "Invalid settings";
}

router.get("/api/admin/bedrock", platformOnly(checkPermission("manage_security")), async (_req: Request, res: Response) => {
  try {
    const { config, source } = await loadBedrockConfig();
    res.json({
      config,
      source,
      configured: isBedrockConfigured(config),
      effectiveRegion: effectiveRegion(config),
      credentials: await bedrockCredentialStatus(),
      purposes: BEDROCK_PURPOSES,
      suggestions: SUGGESTED_MODELS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/admin/bedrock", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  let next;
  try { next = parseBedrockConfig(req.body); }
  catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: zodMessage(err), issues: err.issues });
    throw err;
  }
  try {
    const { config: before } = await loadBedrockConfig();
    await saveBedrockConfig(next);
    audit(req, "bedrock_settings_changed", { changed: changedBedrockFields(before, next), enabled: next.enabled, awsOnly: next.awsOnly });
    res.json({ config: next, configured: isBedrockConfigured(next), effectiveRegion: effectiveRegion(next) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/bedrock/credentials", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  const parsed = bedrockCredentialsSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error), issues: parsed.error.issues });
  try {
    await saveBedrockCredentials(parsed.data, (req as any).authUser?.username);
    audit(req, "bedrock_credentials_saved", { sessionToken: !!parsed.data.sessionToken });
    res.json(await bedrockCredentialStatus());
  } catch (err: any) {
    if (err instanceof LockdownError) return res.status(403).json({ error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/bedrock/credentials", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  try {
    await clearBedrockCredentials();
    audit(req, "bedrock_credentials_cleared", {});
    res.json(await bedrockCredentialStatus());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const testSchema = z.object({ purpose: z.enum(BEDROCK_PURPOSES) }).strict();

router.post("/api/admin/bedrock/test", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  const parsed = testSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  try {
    const { config } = await loadBedrockConfig();
    const row = config.models[parsed.data.purpose];
    let result;
    try {
      result = await testBedrockModel(await runtimeFor(config), config, parsed.data.purpose);
    } catch (err) {
      // Building the client failed (no region, keys chosen but none saved): still a result, not a server error.
      result = { ok: false, purpose: parsed.data.purpose, modelId: row?.modelId ?? "", latencyMs: 0, problem: explainBedrockError(err, { modelId: row?.modelId ?? "", region: effectiveRegion(config) }) };
    }
    audit(req, "bedrock_connection_tested", { purpose: result.purpose, ok: result.ok, code: result.problem?.code });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/bedrock/policy", platformOnly(checkPermission("manage_security")), async (_req: Request, res: Response) => {
  try {
    const { config } = await loadBedrockConfig();
    res.json({ policy: generateIamPolicy(config), hasModels: BEDROCK_PURPOSES.some((p) => !!config.models[p]) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── document search: which model, and the move to another ────────────────────────────────────────────────────────

const toSchema = z.object({ to: z.enum(["bedrock", "openai"]) }).strict();

/** The target a request names. Bedrock needs the saved settings to describe a model and, if the size is not set, one real call. */
async function resolveTarget(to: "bedrock" | "openai"): Promise<EmbeddingTarget> {
  if (to === "openai") {
    if (!isOpenAiEmbeddingConfigured()) throw new SearchSwitchError("OpenAI is not set up on this server (no OPENAI_API_KEY), so document search cannot use it.", 400);
    return openAiTarget();
  }
  const { config } = await loadBedrockConfig();
  const cfg = configuredBedrockTarget(config);
  if (!cfg.ok) throw new SearchSwitchError(cfg.reason, 400);
  const dimensions = cfg.row.dimensions ?? (await probeDimensions({ modelId: cfg.row.modelId, family: cfg.row.family }));
  return bedrockTarget({ modelId: cfg.row.modelId, family: cfg.row.family, dimensions });
}

function searchError(res: Response, err: unknown) {
  if (err instanceof SearchSwitchError) return res.status(err.status).json({ error: err.message });
  if (err instanceof BedrockError) return res.status(400).json({ error: err.problem.message, hint: err.problem.hint });
  if (looksLikeAwsError(err)) { const p = explainBedrockError(err, { modelId: "", region: "" }); return res.status(400).json({ error: p.message, hint: p.hint }); }
  return res.status(500).json({ error: (err as Error)?.message ?? "Failed" });
}

router.get("/api/admin/bedrock/search", platformOnly(checkPermission("manage_security")), async (_req: Request, res: Response) => {
  try {
    const active = await getActiveEmbedding();
    const { config } = await loadBedrockConfig();
    const cfg = configuredBedrockTarget(config);
    const bedrockSize = cfg.ok ? cfg.row.dimensions : null;
    const targets: Record<string, unknown> = {};
    const coverageOf = async (t: EmbeddingTarget) => { try { return await pgVectorStore.coverage(t); } catch { return null; } };
    const openAi = openAiTarget();
    targets.openai = { available: isOpenAiEmbeddingConfigured(), label: openAi.label, active: active.provider === "openai", coverage: await coverageOf(openAi) };
    targets.bedrock = cfg.ok
      ? {
          available: true, modelId: cfg.row.modelId, dimensions: bedrockSize, label: bedrockSize ? bedrockTarget({ modelId: cfg.row.modelId, family: cfg.row.family, dimensions: bedrockSize }).label : `Amazon Bedrock ${cfg.row.modelId}`,
          active: active.provider === "aws_bedrock" && active.modelId === cfg.row.modelId && (bedrockSize == null || active.dimensions === bedrockSize),
          coverage: bedrockSize ? await coverageOf(bedrockTarget({ modelId: cfg.row.modelId, family: cfg.row.family, dimensions: bedrockSize })) : null,
        }
      : { available: false, reason: cfg.reason };
    res.json({ active: { provider: active.provider, modelId: active.modelId, dimensions: active.dimensions, label: active.label }, targets, migration: await currentMigration() });
  } catch (err) {
    searchError(res, err);
  }
});

router.post("/api/admin/bedrock/search/reembed", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  const parsed = toSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  try {
    const target = await resolveTarget(parsed.data.to);
    const status = await startMigration(realMigrationDeps, target, (req as any).authUser?.username ?? null);
    audit(req, "embedding_reembed_started", { to: parsed.data.to, targetKey: target.modelKey, total: status.total, covered: status.covered });
    res.status(202).json(status);
  } catch (err) {
    searchError(res, err);
  }
});

router.post("/api/admin/bedrock/search/stop", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  try {
    const status = await requestStop(realMigrationDeps);
    audit(req, "embedding_reembed_stop_requested", { targetKey: status.targetKey });
    res.json(status);
  } catch (err) {
    searchError(res, err);
  }
});

router.post("/api/admin/bedrock/search/switch", platformOnly(checkPermission("manage_security")), async (req: Request, res: Response) => {
  const parsed = toSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: zodMessage(parsed.error) });
  try {
    const before = await getActiveEmbedding();
    const target = await resolveTarget(parsed.data.to);
    if (before.modelKey === target.modelKey) return res.status(409).json({ error: "Document search already uses this model." });
    const result = await switchActive(realMigrationDeps, target, (req as any).authUser?.username);
    audit(req, "embedding_model_switched", { from: before.modelKey, to: target.modelKey, passages: result.coverage.total });
    res.json({ active: { provider: target.provider, modelId: target.modelId, dimensions: target.dimensions, label: target.label }, coverage: result.coverage });
  } catch (err) {
    searchError(res, err);
  }
});

export default router;
