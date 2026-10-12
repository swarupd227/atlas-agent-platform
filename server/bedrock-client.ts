/**
 * Talking to Amazon Bedrock: building the client from the administrator's settings, the request and response shapes of the
 * embedding models, a connection test, plain-language explanations of what goes wrong, and the permission policy the settings
 * imply.
 *
 * Nothing is read from the environment or the database here except through the arguments, so all of it is testable without AWS:
 * a function that talks to Bedrock takes a `sender` (anything with `send(command)`), which is the real client in production.
 */
import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  BEDROCK_PURPOSES, effectiveRegion, embeddingFamilyOf, loadBedrockCredentials,
  type BedrockConfig, type BedrockCredentials, type BedrockModelRow, type BedrockPurpose,
} from "./bedrock-config";

export interface BedrockSender { send(command: any): Promise<any> }

/** Something wrong that an administrator can fix, said in words they can act on. */
export interface BedrockProblem { code: string; message: string; hint: string }

export class BedrockError extends Error {
  constructor(public readonly problem: BedrockProblem, public readonly cause?: unknown) {
    super(problem.message);
    this.name = "BedrockError";
  }
}

// ── the client ───────────────────────────────────────────────────────────────────────────────────────────────────

export function createBedrockRuntime(config: BedrockConfig, creds: BedrockCredentials | null): BedrockRuntimeClient {
  const region = effectiveRegion(config);
  if (!region) {
    throw new BedrockError({ code: "no_region", message: "No region is set.", hint: "Choose the AWS region Bedrock runs in on this page, or run the server in an AWS region (AWS_REGION)." });
  }
  if (config.credentialMode === "keys" && !creds) {
    throw new BedrockError({ code: "no_credentials", message: "Access is set to 'Enter access keys' but none are saved.", hint: "Save an access key and secret on this page, or switch Access to 'Use this server's AWS role'." });
  }
  return new BedrockRuntimeClient({
    region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.credentialMode === "keys" && creds
      ? { credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey, ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}) } }
      : {}),
    maxAttempts: 2,
    requestHandler: { requestTimeout: config.limits.timeoutMs, connectionTimeout: 5_000 },
  });
}

/** The client for the saved settings. */
export async function runtimeFor(config: BedrockConfig): Promise<BedrockRuntimeClient> {
  return createBedrockRuntime(config, config.credentialMode === "keys" ? await loadBedrockCredentials() : null);
}

// ── embeddings ───────────────────────────────────────────────────────────────────────────────────────────────────

/** What an embedding is for. Cohere computes a different vector for a stored passage than for a question about it. */
export type EmbeddingKind = "document" | "query";

export const COHERE_MAX_TEXTS_PER_CALL = 96;

export interface BedrockInvocation { modelId: string; body: Record<string, unknown> }

/** The request body for one Titan call: one text. `dimensions` is sent only when the row names one. */
export function titanInvocation(row: BedrockModelRow, text: string): BedrockInvocation {
  return {
    modelId: row.modelId,
    body: { inputText: text, ...(row.dimensions ? { dimensions: row.dimensions, normalize: true } : {}) },
  };
}

/** The request body for one Cohere call: up to 96 texts. */
export function cohereInvocation(row: BedrockModelRow, texts: string[], kind: EmbeddingKind): BedrockInvocation {
  return {
    modelId: row.modelId,
    body: { texts, input_type: kind === "query" ? "search_query" : "search_document", truncate: "END" },
  };
}

function readBody(response: any): any {
  const raw = response?.body;
  if (raw == null) throw new Error("Bedrock returned an empty answer");
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw as Uint8Array);
  return JSON.parse(text);
}

export function parseTitanVector(body: any): number[] {
  const v = body?.embedding;
  if (!Array.isArray(v) || v.length === 0) throw new Error("The Titan answer has no embedding");
  return v as number[];
}

export function parseCohereVectors(body: any): number[][] {
  const e = body?.embeddings;
  const list = Array.isArray(e) ? e : Array.isArray(e?.float) ? e.float : null;
  if (!list || list.length === 0 || !Array.isArray(list[0])) throw new Error("The Cohere answer has no embeddings");
  return list as number[][];
}

async function inBatches<T, R>(items: T[], size: number, parallel: number, fn: (batch: T[], index: number) => Promise<R>): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  const out: R[] = new Array(batches.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, batches.length)) }, async () => {
    while (next < batches.length) { const k = next++; out[k] = await fn(batches[k], k); }
  }));
  return out;
}

/**
 * Vectors for the given texts, in the same order. Titan takes one text per call and Cohere up to 96, so Titan is run
 * `maxConcurrent` calls at a time to stay inside the account's quota.
 */
export async function embedTexts(
  sender: BedrockSender,
  row: BedrockModelRow,
  texts: string[],
  kind: EmbeddingKind,
  limits: { maxConcurrent: number },
): Promise<{ vectors: number[][]; dimensions: number }> {
  const family = embeddingFamilyOf(row);
  if (!family) throw new BedrockError({ code: "unknown_family", message: "Cannot tell which kind of embedding model this is.", hint: "Choose Titan or Cohere for this model." });
  if (texts.length === 0) return { vectors: [], dimensions: row.dimensions ?? 0 };

  const invoke = async (inv: BedrockInvocation) =>
    readBody(await sender.send(new InvokeModelCommand({ modelId: inv.modelId, contentType: "application/json", accept: "application/json", body: JSON.stringify(inv.body) })));

  let vectors: number[][];
  if (family === "titan") {
    const each = await inBatches(texts, 1, limits.maxConcurrent, async ([t]) => parseTitanVector(await invoke(titanInvocation(row, t))));
    vectors = each;
  } else {
    const each = await inBatches(texts, COHERE_MAX_TEXTS_PER_CALL, limits.maxConcurrent, async (batch) => parseCohereVectors(await invoke(cohereInvocation(row, batch, kind))));
    vectors = each.flat();
  }
  if (vectors.length !== texts.length) throw new Error(`Bedrock returned ${vectors.length} vectors for ${texts.length} texts`);
  const dimensions = vectors[0].length;
  if (row.dimensions && row.dimensions !== dimensions) {
    throw new BedrockError({
      code: "dimension_mismatch",
      message: `The model returned vectors of ${dimensions} numbers, but the settings say ${row.dimensions}.`,
      hint: `Set the vector size for this model to ${dimensions}, or leave it empty so it is detected.`,
    });
  }
  return { vectors, dimensions };
}

// ── the connection test ──────────────────────────────────────────────────────────────────────────────────────────

export interface BedrockTestResult {
  ok: boolean;
  purpose: BedrockPurpose;
  modelId: string;
  latencyMs: number;
  /** Embedding models: the size of the vector the model really returned. */
  dimensions?: number;
  /** Chat models: what the model answered. */
  reply?: string;
  problem?: BedrockProblem;
}

/** One tiny real call with the saved settings. Never throws: a failure is a result with a plain-language problem. */
export async function testBedrockModel(sender: BedrockSender, config: BedrockConfig, purpose: BedrockPurpose): Promise<BedrockTestResult> {
  const row = config.models[purpose];
  if (!row) {
    return { ok: false, purpose, modelId: "", latencyMs: 0, problem: { code: "no_model", message: "No model is set for this job.", hint: "Enter a model id for it, save, then test again." } };
  }
  const started = Date.now();
  try {
    if (purpose === "embedding") {
      const { dimensions } = await embedTexts(sender, row, ["Connection test."], "document", config.limits);
      return { ok: true, purpose, modelId: row.modelId, latencyMs: Date.now() - started, dimensions };
    }
    const out = await sender.send(new ConverseCommand({
      modelId: row.modelId,
      messages: [{ role: "user", content: [{ text: "Reply with the single word OK." }] }],
      inferenceConfig: { maxTokens: 16, temperature: 0 },
    }));
    const reply = String(out?.output?.message?.content?.[0]?.text ?? "").trim().slice(0, 80);
    return { ok: true, purpose, modelId: row.modelId, latencyMs: Date.now() - started, reply };
  } catch (err) {
    return { ok: false, purpose, modelId: row.modelId, latencyMs: Date.now() - started, problem: explainBedrockError(err, { modelId: row.modelId, region: effectiveRegion(config) }) };
  }
}

// ── what went wrong, in words ────────────────────────────────────────────────────────────────────────────────────

export function explainBedrockError(err: unknown, ctx: { modelId: string; region: string }): BedrockProblem {
  if (err instanceof BedrockError) return err.problem;
  const e = err as { name?: string; message?: string; code?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  const name = e?.name ?? "";
  const msg = String(e?.message ?? err ?? "");
  const status = e?.$metadata?.httpStatusCode;
  const region = ctx.region || "your region";

  if (name === "CredentialsProviderError" || /could not load credentials|no credentials|missing credentials/i.test(msg)) {
    return { code: "no_credentials", message: "The server has no AWS credentials to use.", hint: "Run the server with an AWS role (recommended), or set Access to 'Enter access keys' and save a key pair." };
  }
  if (/UnrecognizedClientException|InvalidSignatureException|security token included in the request is invalid|signature we calculated does not match/i.test(name + " " + msg)) {
    return { code: "bad_credentials", message: "AWS did not accept the access keys.", hint: "Check the access key id and secret (and the session token, if they are temporary), or switch to the server's AWS role." };
  }
  if (name === "AccessDeniedException" || status === 403) {
    if (/don't have access to the model|model access|not enabled|access to this model/i.test(msg) && !/not authorized to perform/i.test(msg)) {
      return { code: "model_access", message: "This model is not switched on for your AWS account in this region.", hint: `In the AWS console open Amazon Bedrock, then Model access (region ${region}), and request access to ${ctx.modelId}. It can take a few minutes.` };
    }
    return { code: "permission", message: "The AWS identity this server uses is not allowed to call this model.", hint: "Give it the policy shown under 'Permissions needed' on this page (ask your AWS administrator to attach it to the server's role)." };
  }
  if (name === "ValidationException" || status === 400) {
    if (/on-demand throughput isn.?t supported|inference profile/i.test(msg)) {
      return { code: "needs_profile", message: "This model cannot be called by its plain id in this region.", hint: "Use an inference profile id instead. It starts with a region group such as us. or eu.; copy it from Bedrock, Cross-region inference." };
    }
    if (/model identifier is invalid|invalid model|malformed model/i.test(msg)) {
      return { code: "bad_model_id", message: "Bedrock does not accept this model id.", hint: "Copy the id again from the Bedrock console (Model catalog), including any suffix such as :0." };
    }
    return { code: "bad_request", message: "Bedrock refused the request.", hint: `It said: ${msg.slice(0, 200)}` };
  }
  if (name === "ResourceNotFoundException" || status === 404) {
    return { code: "model_not_found", message: "Bedrock does not know this model in this region.", hint: `Check the id and the region (${region}); not every model is offered in every region.` };
  }
  if (name === "ThrottlingException" || name === "TooManyRequestsException" || status === 429) {
    return { code: "throttled", message: "Bedrock is limiting requests for this AWS account.", hint: "Lower 'Requests at once' on this page, or ask AWS to raise the quota for this model." };
  }
  if (name === "ModelNotReadyException" || name === "ServiceUnavailableException" || name === "ModelTimeoutException" || (status !== undefined && status >= 500)) {
    return { code: "unavailable", message: "Bedrock could not answer right now.", hint: "Try again in a minute. If it keeps happening, check the AWS status page for the region." };
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET|TimeoutError|socket hang up|getaddrinfo/i.test(name + " " + msg + " " + (e?.code ?? ""))) {
    return { code: "unreachable", message: "The server could not reach Bedrock.", hint: `Check the region (${region}), the private address if one is set, and that the server may make outbound calls to Bedrock.` };
  }
  return { code: "error", message: msg.slice(0, 200) || "Bedrock returned an error.", hint: "If this keeps happening, copy this message to your AWS administrator." };
}

// ── the permissions the settings imply ───────────────────────────────────────────────────────────────────────────

const PROFILE_PREFIX = /^(us|eu|apac|us-gov|jp|au|ca|global)\./i;

function partitionOf(region: string): string {
  if (region.startsWith("us-gov-")) return "aws-us-gov";
  if (region.startsWith("cn-")) return "aws-cn";
  return "aws";
}

/**
 * The IAM policy that lets the server call exactly the configured models. Written from the settings, so nobody has to work out
 * resource names by hand. The account number is left as * (an inference profile belongs to an account); an administrator who
 * wants it narrower can put theirs in.
 */
export function generateIamPolicy(config: BedrockConfig): { Version: string; Statement: Array<Record<string, unknown>> } {
  const region = effectiveRegion(config) || "<region>";
  const partition = partitionOf(region);
  const resources = new Set<string>();
  for (const purpose of BEDROCK_PURPOSES) {
    const row = config.models[purpose];
    if (!row) continue;
    const id = row.modelId;
    if (id.startsWith("arn:")) { resources.add(id); continue; }
    if (PROFILE_PREFIX.test(id)) {
      // A cross-region inference profile: the profile itself, and the model it stands for in every region it may route to.
      resources.add(`arn:${partition}:bedrock:${region}:*:inference-profile/${id}`);
      resources.add(`arn:${partition}:bedrock:*::foundation-model/${id.replace(PROFILE_PREFIX, "")}`);
    } else {
      resources.add(`arn:${partition}:bedrock:${region}::foundation-model/${id}`);
    }
  }
  return {
    Version: "2012-10-17",
    Statement: [{
      Sid: "AstraBedrockInvoke",
      Effect: "Allow",
      Action: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      Resource: [...resources].sort(),
    }],
  };
}
