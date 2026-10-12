/**
 * Amazon Bedrock administration (the "Amazon Bedrock" card on the Model Providers page):
 *
 *   GET    /api/admin/bedrock              the settings, where they came from, and whether access keys are saved
 *   PUT    /api/admin/bedrock              save the settings
 *   POST   /api/admin/bedrock/credentials  save access keys (encrypted); optional: without them the server's own AWS role is used
 *   DELETE /api/admin/bedrock/credentials  remove them
 *   POST   /api/admin/bedrock/test         one tiny real call with the saved settings, for one job (embedding, chat or fast)
 *   GET    /api/admin/bedrock/policy       the AWS permissions the saved settings need
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
import { generateIamPolicy, runtimeFor, testBedrockModel, explainBedrockError } from "../bedrock-client";

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

export default router;
