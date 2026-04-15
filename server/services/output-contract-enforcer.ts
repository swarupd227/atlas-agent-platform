import { createHash } from "crypto";
import Ajv2020 from "ajv/dist/2020";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { completeWithFallback, getProvider } from "../llm-provider";
import type { OutputContract } from "../../shared/schema";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface NormalizerRule {
  field: string;
  type: "clamp_numeric" | "map_aliases" | "coerce_to_string";
  min?: number;
  max?: number;
  default?: number | string;
  aliases?: Record<string, string>;
  handle_null?: "empty_string" | "null";
  handle_array?: "join_comma" | "first";
  handle_dict?: "join_values" | "stringify";
  trim?: boolean;
}

export interface PromptSpec {
  id: string;
  version: string;
  text: string;
}

export interface EnforcementContext {
  agentId: string;
  pipelineRunId?: string;
  dagNodeId?: string;
  promptSpec: PromptSpec;
  originalPayload: Record<string, unknown>;
  llmLatencyMs: number;
  tokenUsage: { promptTokens: number; completionTokens: number };
  provider?: string;
  model?: string;
  traceId?: string;
  spanId?: string;
}

export interface SectionScore {
  sectionId: string;
  structure: number;
  style: number;
  tone: number;
  completeness: number;
  score: number;
}

export interface QualityScore {
  overallScore: number;
  sectionScores: SectionScore[];
  failingSections: string[];
}

export interface ExpectedSection {
  section_id: string;
  mandatory_phrases?: string[];
  target_word_min?: number;
  target_word_max?: number;
  required_slots?: string[];
  prefer_bullets?: boolean;
}

export interface QualityScorerConfig {
  expected_sections?: ExpectedSection[];
  failure_threshold?: number;
}

interface RepairResult {
  success: boolean;
  parsed?: Record<string, unknown>;
  rawResponse?: string;
}

export interface EnforcementResult {
  output: Record<string, unknown>;
  validationStatus: "passed" | "repaired" | "fallback" | "failed";
  repairAttempts: number;
  validationErrors: string[];
  qualityScore?: number;
  qualityDetails?: QualityScore;
  generationMetadataId?: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
}

export class StructuredOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredOutputValidationError";
  }
}

// ── OutputContractEnforcer ────────────────────────────────────────────────────

export class OutputContractEnforcer {
  private ajv: InstanceType<typeof Ajv2020>;

  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false });
  }

  async enforce(
    contract: OutputContract,
    llmResponse: string,
    context: EnforcementContext,
  ): Promise<EnforcementResult> {
    const startTime = performance.now();
    const validationErrors: string[] = [];
    let repairAttempts = 0;
    let currentResponse = llmResponse;

    // STEP 1: Parse JSON
    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseJSON(currentResponse);
    } catch (parseError: unknown) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      validationErrors.push(`JSON parse error: ${msg}`);

      if (contract.repairEnabled) {
        const repairResult = await this.attemptRepair(contract, context, currentResponse, msg);
        repairAttempts++;
        if (repairResult.success && repairResult.parsed) {
          parsed = repairResult.parsed;
          currentResponse = repairResult.rawResponse ?? currentResponse;
        } else {
          // No best-effort output available — JSON parse failed even after repair
          return await this.handleFailure(contract, validationErrors, repairAttempts, context, startTime, undefined);
        }
      } else {
        return await this.handleFailure(contract, validationErrors, repairAttempts, context, startTime, undefined);
      }
    }

    // STEP 2: Apply normalizers
    const normalizers = (contract.normalizers as NormalizerRule[] | null) ?? [];
    const normalized = this.applyNormalizers(parsed, normalizers);

    // STEP 3: Validate against schema
    let validated = normalized;
    const schemaDef = (contract.schemaDefinition as Record<string, unknown>) ?? {};
    const schemaErrors = this.validateAgainstSchema(normalized, schemaDef);

    if (schemaErrors.length > 0) {
      validationErrors.push(...schemaErrors);

      if (contract.repairEnabled && repairAttempts < (contract.maxRepairAttempts ?? 1)) {
        const repairResult = await this.attemptRepair(contract, context, currentResponse, schemaErrors.join("; "));
        repairAttempts++;
        if (repairResult.success && repairResult.parsed) {
          const reNormalized = this.applyNormalizers(repairResult.parsed, normalizers);
          const reErrors = this.validateAgainstSchema(reNormalized, schemaDef);
          if (reErrors.length === 0) {
            validated = reNormalized;
          } else {
            validationErrors.push(...reErrors.map(e => `[repair] ${e}`));
            // Pass reNormalized as best-effort for monitor mode continuity
            return await this.handleFailure(contract, validationErrors, repairAttempts, context, startTime, reNormalized);
          }
        } else {
          // Repair call failed — use original normalized as best-effort
          return await this.handleFailure(contract, validationErrors, repairAttempts, context, startTime, normalized);
        }
      } else {
        // No repair — use normalized as best-effort
        return await this.handleFailure(contract, validationErrors, repairAttempts, context, startTime, normalized);
      }
    }

    // STEP 4: Quality scoring (optional)
    let qualityScore: number | undefined;
    let qualityDetails: QualityScore | undefined;

    if (contract.qualityScorerEnabled && contract.qualityScorerConfig) {
      const config = contract.qualityScorerConfig as QualityScorerConfig;
      const scoring = this.scoreQuality(validated, config);
      qualityScore = scoring.overallScore;
      qualityDetails = scoring;

      if (scoring.failingSections.length > 0) {
        validated = this.deterministicRepair(validated, scoring, config);
      }
    }

    // STEP 5: Record generation metadata
    const validationLatencyMs = performance.now() - startTime;
    const metadataId = await this.recordMetadata({
      context,
      validationStatus: repairAttempts > 0 ? "repaired" : "passed",
      repairAttempts,
      validationErrors,
      qualityScore,
      qualityDetails,
      validationLatencyMs,
    });

    return {
      output: validated,
      validationStatus: repairAttempts > 0 ? "repaired" : "passed",
      repairAttempts,
      validationErrors,
      qualityScore,
      qualityDetails,
      generationMetadataId: metadataId,
      tokenUsage: context.tokenUsage,
    };
  }

  // Dry-run: validate without recording metadata or making LLM repair calls
  dryRun(
    contract: OutputContract,
    sampleJson: string,
  ): Omit<EnforcementResult, "generationMetadataId"> {
    const validationErrors: string[] = [];

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parseJSON(sampleJson);
    } catch (parseError: unknown) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      return {
        output: {},
        validationStatus: "failed",
        repairAttempts: 0,
        validationErrors: [`JSON parse error: ${msg}`],
      };
    }

    const normalizers = (contract.normalizers as NormalizerRule[] | null) ?? [];
    const normalized = this.applyNormalizers(parsed, normalizers);
    const schemaDef = (contract.schemaDefinition as Record<string, unknown>) ?? {};
    const schemaErrors = this.validateAgainstSchema(normalized, schemaDef);

    if (schemaErrors.length > 0) {
      return {
        output: normalized,
        validationStatus: "failed",
        repairAttempts: 0,
        validationErrors: schemaErrors,
      };
    }

    let qualityScore: number | undefined;
    let qualityDetails: QualityScore | undefined;
    let output = normalized;

    if (contract.qualityScorerEnabled && contract.qualityScorerConfig) {
      const config = contract.qualityScorerConfig as QualityScorerConfig;
      const scoring = this.scoreQuality(normalized, config);
      qualityScore = scoring.overallScore;
      qualityDetails = scoring;
      if (scoring.failingSections.length > 0) {
        output = this.deterministicRepair(normalized, scoring, config);
      }
    }

    return {
      output,
      validationStatus: "passed",
      repairAttempts: 0,
      validationErrors,
      qualityScore,
      qualityDetails,
    };
  }

  // ── Private methods ─────────────────────────────────────────────────────────

  private parseJSON(response: string): Record<string, unknown> {
    let text = response.trim();
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new TypeError("Expected top-level JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  private applyNormalizers(
    data: Record<string, unknown>,
    normalizers: NormalizerRule[],
  ): Record<string, unknown> {
    let result = { ...data };
    for (const rule of normalizers) {
      result = this.applyNormalizerRule(result, rule);
    }
    return result;
  }

  private applyNormalizerRule(
    data: Record<string, unknown>,
    rule: NormalizerRule,
  ): Record<string, unknown> {
    const transform = (val: unknown): unknown => {
      switch (rule.type) {
        case "clamp_numeric": {
          const num = parseFloat(String(val));
          if (isNaN(num)) return rule.default ?? 0;
          return Math.max(rule.min ?? -Infinity, Math.min(rule.max ?? Infinity, num));
        }
        case "map_aliases": {
          const text = String(val ?? "").trim().toLowerCase();
          return (rule.aliases ?? {})[text] ?? rule.default ?? val;
        }
        case "coerce_to_string": {
          if (val === null || val === undefined) {
            return rule.handle_null === "empty_string" ? "" : "null";
          }
          if (Array.isArray(val)) {
            if (rule.handle_array === "first") return val.length > 0 ? String(val[0]) : "";
            return val.map(String).join(", ");
          }
          if (typeof val === "object") {
            if (rule.handle_dict === "stringify") return JSON.stringify(val);
            return Object.values(val as Record<string, unknown>).map(String).join(", ");
          }
          const s = String(val);
          return rule.trim !== false ? s.trim() : s;
        }
        default:
          return val;
      }
    };

    return this.applyAtPath(data, rule.field, transform);
  }

  private applyAtPath(
    data: Record<string, unknown>,
    fieldPath: string,
    transform: (val: unknown) => unknown,
  ): Record<string, unknown> {
    const parts = fieldPath.split(".");
    return this.applyAtPathParts(data, parts, transform) as Record<string, unknown>;
  }

  private applyAtPathParts(
    data: unknown,
    parts: string[],
    transform: (val: unknown) => unknown,
  ): unknown {
    if (parts.length === 0) return transform(data);
    if (typeof data !== "object" || data === null) return data;

    const [head, ...tail] = parts;
    const obj = data as Record<string, unknown>;

    if (head === "*") {
      const result: Record<string, unknown> = { ...obj };
      for (const key of Object.keys(result)) {
        result[key] = this.applyAtPathParts(result[key], tail, transform);
      }
      return result;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.applyAtPathParts(item, parts, transform));
    }

    if (Object.prototype.hasOwnProperty.call(obj, head)) {
      return { ...obj, [head]: this.applyAtPathParts(obj[head], tail, transform) };
    }
    return obj;
  }

  private validateAgainstSchema(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): string[] {
    if (!schema || Object.keys(schema).length === 0) return [];
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(data);
      if (valid) return [];
      return (validate.errors ?? []).map(err =>
        `${err.instancePath || "/"}: ${err.message} (${err.keyword})`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return [`Schema compilation error: ${msg}`];
    }
  }

  private async attemptRepair(
    contract: OutputContract,
    context: EnforcementContext,
    previousResponse: string,
    errorMessage: string,
  ): Promise<RepairResult> {
    const repairSuffix = contract.repairPromptSuffix ??
      "The previous response did not match the required JSON contract. " +
      "Return corrected JSON only, with the same shape described in the system instructions. " +
      "Do not add markdown, comments, or extra keys.";

    const repairPayload = {
      ...context.originalPayload,
      _repair_request: {
        previous_attempt_invalid: true,
        previous_response_excerpt: previousResponse.slice(0, 4000),
        validation_error_excerpt: errorMessage.slice(0, 1500),
      },
    };

    try {
      const providerName = context.provider ?? "openai";
      const modelName = context.model ?? "gpt-4.1";
      const llmProvider = getProvider(providerName);
      const fallback = llmProvider.providerName === "openai" ? getProvider("anthropic") : getProvider("openai");

      const systemPrompt = `${context.promptSpec.text}\n\n${repairSuffix}`;
      const repairResponse = await completeWithFallback(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(repairPayload) },
        ],
        {
          model: modelName,
          temperature: contract.repairTemperature ?? 0.0,
          responseFormat: "json",
          maxTokens: 4096,
        },
        [llmProvider, fallback],
      );

      const parsed = this.parseJSON(repairResponse.content);
      return { success: true, parsed, rawResponse: repairResponse.content };
    } catch {
      return { success: false };
    }
  }

  private async handleFailure(
    contract: OutputContract,
    validationErrors: string[],
    repairAttempts: number,
    context: EnforcementContext,
    startTime: number,
    bestEffortOutput?: Record<string, unknown>,
  ): Promise<EnforcementResult> {
    const validationLatencyMs = performance.now() - startTime;
    const metadataId = await this.recordMetadata({
      context,
      validationStatus: "failed",
      repairAttempts,
      validationErrors,
      validationLatencyMs,
    });

    const mode = contract.enforcementMode ?? "strict";
    const tokenUsage = context.tokenUsage;

    switch (mode) {
      case "strict":
        throw new StructuredOutputValidationError(
          `Output validation failed after ${repairAttempts} repair attempt(s): ${validationErrors.join("; ")}`
        );

      case "strict_with_interrupt":
        return {
          output: {},
          validationStatus: "failed",
          repairAttempts,
          validationErrors,
          generationMetadataId: metadataId,
          tokenUsage,
        };

      case "lenient": {
        const fallback = (contract.fallbackOutput as Record<string, unknown> | null) ?? {};
        return {
          output: fallback,
          validationStatus: "fallback",
          repairAttempts,
          validationErrors,
          generationMetadataId: metadataId,
          tokenUsage,
        };
      }

      case "monitor":
        // Log but continue — preserve best-effort parsed output so execution is not blocked
        console.warn("[output-contract-enforcer] Validation failed in monitor mode (logging only):", validationErrors);
        return {
          output: bestEffortOutput ?? {},
          validationStatus: "failed",
          repairAttempts,
          validationErrors,
          generationMetadataId: metadataId,
          tokenUsage,
        };

      default:
        throw new StructuredOutputValidationError(
          `Output validation failed: ${validationErrors.join("; ")}`
        );
    }
  }

  private scoreQuality(data: Record<string, unknown>, config: QualityScorerConfig): QualityScore {
    const sections = Array.isArray((data as Record<string, unknown>).sections)
      ? (data as Record<string, unknown[]>).sections
      : [];
    const sectionScores: SectionScore[] = [];
    const failingSections: string[] = [];
    const threshold = config.failure_threshold ?? 0.68;

    for (const expected of config.expected_sections ?? []) {
      const actual = (sections as Array<Record<string, unknown>>).find(
        (s) => s.section_id === expected.section_id
      );
      const content = String((actual?.content_markdown as string) ?? "");
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const lowered = content.toLowerCase();

      const structure = actual ? 1.0 : 0.0;

      const phraseHits = (expected.mandatory_phrases ?? [])
        .filter((p) => lowered.includes(p.toLowerCase())).length;
      const style = (expected.mandatory_phrases ?? []).length > 0
        ? phraseHits / expected.mandatory_phrases!.length
        : 1.0;

      const tone = this.wordCountScore(wordCount, expected.target_word_min ?? 90, expected.target_word_max ?? 260);

      const slotHits = (expected.required_slots ?? [])
        .filter((s) => lowered.includes(s.replace(/_/g, " "))).length;
      const completeness = (expected.required_slots ?? []).length > 0
        ? slotHits / expected.required_slots!.length
        : 1.0;

      const score = 0.35 * structure + 0.25 * style + 0.20 * tone + 0.20 * completeness;

      sectionScores.push({ sectionId: expected.section_id, structure, style, tone, completeness, score });

      if (score < threshold) {
        failingSections.push(expected.section_id);
      }
    }

    const overallScore = sectionScores.length
      ? sectionScores.reduce((sum, s) => sum + s.score, 0) / sectionScores.length
      : 1.0;

    return { overallScore, sectionScores, failingSections };
  }

  private wordCountScore(actual: number, min: number, max: number): number {
    if (actual >= min && actual <= max) return 1.0;
    if (actual < min) return Math.max(0, actual / min);
    const over = actual - max;
    const range = max - min;
    return Math.max(0, 1.0 - over / range);
  }

  private deterministicRepair(
    data: Record<string, unknown>,
    scoring: QualityScore,
    config: QualityScorerConfig,
  ): Record<string, unknown> {
    const sections = [...(Array.isArray((data as Record<string, unknown>).sections)
      ? (data as Record<string, unknown[]>).sections as Array<Record<string, unknown>>
      : [])];

    for (const failingId of scoring.failingSections) {
      const expected = (config.expected_sections ?? []).find((s) => s.section_id === failingId);
      if (!expected) continue;

      const sectionIdx = sections.findIndex((s) => s.section_id === failingId);
      if (sectionIdx === -1) continue;

      let content = String(sections[sectionIdx].content_markdown ?? "");
      const lowered = content.toLowerCase();

      const missing = (expected.mandatory_phrases ?? [])
        .filter((p) => !lowered.includes(p.toLowerCase()));
      if (missing.length > 0) {
        content += "\n\n### Coverage Anchors\n" + missing.map((p) => `- ${p}`).join("\n");
      }

      if (expected.prefer_bullets && !content.includes("- ") && !content.includes("* ")) {
        const firstPara = content.split("\n\n")[0] ?? "";
        const sentences = firstPara.split(/(?<=[.!?])\s+/).filter(Boolean);
        if (sentences.length >= 2) {
          const bullets = sentences.slice(0, 4).map((s) => `- ${s.replace(/\.$/, "")}`).join("\n");
          content = content.replace(firstPara, bullets);
        }
      }

      const words = content.split(/\s+/).filter(Boolean);
      const maxWords = (expected.target_word_max ?? 260) + 60;
      if (words.length > maxWords) {
        content = words.slice(0, maxWords).join(" ") + "...";
      }

      sections[sectionIdx] = { ...sections[sectionIdx], content_markdown: content };
    }

    return { ...data, sections };
  }

  private async recordMetadata(args: {
    context: EnforcementContext;
    validationStatus: "passed" | "repaired" | "fallback" | "failed";
    repairAttempts: number;
    validationErrors: string[];
    qualityScore?: number;
    qualityDetails?: QualityScore;
    validationLatencyMs: number;
  }): Promise<string | undefined> {
    try {
      const { context, validationStatus, repairAttempts, validationErrors, qualityScore, qualityDetails, validationLatencyMs } = args;
      const promptSha256 = createHash("sha256").update(context.promptSpec.text).digest("hex");
      const totalLatencyMs = context.llmLatencyMs + validationLatencyMs;

      const result = await db.execute(sql`
        INSERT INTO generation_metadata_records (
          pipeline_run_id, agent_id, dag_node_id,
          provider, model,
          prompt_id, prompt_version, prompt_sha256,
          prompt_tokens, completion_tokens, total_tokens,
          validation_status, repair_attempts, validation_errors,
          quality_score, quality_details,
          trace_id, span_id,
          llm_latency_ms, validation_latency_ms, total_latency_ms
        ) VALUES (
          ${context.pipelineRunId ?? null},
          ${context.agentId},
          ${context.dagNodeId ?? null},
          ${context.provider ?? "openai"},
          ${context.model ?? "gpt-4.1"},
          ${context.promptSpec.id},
          ${context.promptSpec.version},
          ${promptSha256},
          ${context.tokenUsage.promptTokens},
          ${context.tokenUsage.completionTokens},
          ${context.tokenUsage.promptTokens + context.tokenUsage.completionTokens},
          ${validationStatus},
          ${repairAttempts},
          ${JSON.stringify(validationErrors)}::jsonb,
          ${qualityScore ?? null},
          ${qualityDetails ? JSON.stringify(qualityDetails) : null}::jsonb,
          ${context.traceId ?? null},
          ${context.spanId ?? null},
          ${context.llmLatencyMs},
          ${validationLatencyMs},
          ${totalLatencyMs}
        ) RETURNING id
      `);
      const rows = result.rows as Array<{ id: string }>;
      return rows[0]?.id;
    } catch (err: unknown) {
      console.warn("[output-contract-enforcer] Failed to record metadata:", err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }
}

export const outputContractEnforcer = new OutputContractEnforcer();
