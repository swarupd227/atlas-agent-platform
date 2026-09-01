/**
 * Lints a JSON Schema against OpenAI's `response_format: json_schema` strict
 * mode requirements, WITHOUT mutating the schema. Contract authors write
 * schemas with their own intent (e.g. an optional field); silently injecting
 * `additionalProperties:false` or completing `required` would honor Ajv
 * validation while quietly changing what the author asked the model for. So
 * an incompatible schema just skips strict mode and falls back to the
 * existing legacy json_object/prompt-instructed path -- see
 * LLMCompletionOptions.jsonSchema in server/llm-provider.ts.
 *
 * This is not an exhaustive enumeration of every strict-mode restriction
 * OpenAI enforces server-side (property/nesting count caps in particular
 * aren't checked here) -- OpenAIProvider.complete()/streamComplete() still
 * carry a one-time runtime fallback for whatever this misses.
 */

const DISALLOWED_KEYWORDS = ["patternProperties", "unevaluatedProperties", "minProperties", "maxProperties", "oneOf"] as const;

export interface StrictModeCompatResult {
  compatible: boolean;
  reason?: string;
}

function checkNode(node: unknown, path: string): StrictModeCompatResult {
  if (node === null || typeof node !== "object") return { compatible: true };
  const schema = node as Record<string, any>;

  for (const keyword of DISALLOWED_KEYWORDS) {
    if (keyword in schema) {
      return { compatible: false, reason: `"${keyword}" at ${path} is not supported by OpenAI strict mode` };
    }
  }

  if (schema.type === "object" || (schema.properties && typeof schema.properties === "object")) {
    if (schema.additionalProperties !== false) {
      return { compatible: false, reason: `${path} is missing "additionalProperties: false"` };
    }
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    const propertyKeys = Object.keys(properties);
    const required: unknown = schema.required;
    const requiredSet = new Set(Array.isArray(required) ? required : []);
    const missingRequired = propertyKeys.filter((k) => !requiredSet.has(k));
    if (missingRequired.length > 0) {
      return {
        compatible: false,
        reason: `${path} has properties not listed in "required" (strict mode requires every property to be required): ${missingRequired.join(", ")}`,
      };
    }
    for (const key of propertyKeys) {
      const result = checkNode(properties[key], `${path}.properties.${key}`);
      if (!result.compatible) return result;
    }
  }

  if (schema.items) {
    const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
    for (let i = 0; i < itemSchemas.length; i++) {
      const result = checkNode(itemSchemas[i], `${path}.items${Array.isArray(schema.items) ? `[${i}]` : ""}`);
      if (!result.compatible) return result;
    }
  }

  if (Array.isArray(schema.anyOf)) {
    for (let i = 0; i < schema.anyOf.length; i++) {
      const result = checkNode(schema.anyOf[i], `${path}.anyOf[${i}]`);
      if (!result.compatible) return result;
    }
  }

  const defs = schema.$defs || schema.definitions;
  if (defs && typeof defs === "object") {
    for (const key of Object.keys(defs)) {
      const result = checkNode(defs[key], `${path}.$defs.${key}`);
      if (!result.compatible) return result;
    }
  }

  return { compatible: true };
}

/** Checks whether `schema` satisfies OpenAI's json_schema strict-mode structural requirements as-authored. */
export function checkStrictModeCompatible(schema: unknown): StrictModeCompatResult {
  if (!schema || typeof schema !== "object") {
    return { compatible: false, reason: "schema is not an object" };
  }
  return checkNode(schema, "$");
}

/**
 * Advisory (not a hard gate, unlike checkStrictModeCompatible): a schema can
 * be perfectly valid for strict mode and still cause a real quality/latency
 * regression. Constrained decoding tracks schema state at every generated
 * token and filters the vocabulary against it -- a wide, deep schema spends
 * attention and compute on that bookkeeping instead of on understanding the
 * source document, which measurably slows generation and degrades quality on
 * any free-form narrative fields in the same response. This effect starts to
 * show past roughly 30-40 fields or 4 levels of nesting. The fix is
 * architectural, not a schema tweak: split the extraction into multiple
 * smaller-schema passes (e.g. separate DAG worker nodes each producing part
 * of the result) rather than one monolithic schema.
 */
const RECOMMENDED_MAX_FIELDS = 40;
const RECOMMENDED_MAX_DEPTH = 4;

export interface SchemaComplexityResult {
  fieldCount: number;
  maxDepth: number;
  withinRecommendedLimits: boolean;
  reason?: string;
}

function walkComplexity(node: unknown, depth: number): { fields: number; maxDepth: number } {
  if (!node || typeof node !== "object") return { fields: 0, maxDepth: depth };
  const schema = node as Record<string, any>;
  let fields = 0;
  let maxDepth = depth;

  if (schema.properties && typeof schema.properties === "object") {
    for (const key of Object.keys(schema.properties)) {
      fields += 1;
      const child = walkComplexity(schema.properties[key], depth + 1);
      fields += child.fields;
      maxDepth = Math.max(maxDepth, child.maxDepth);
    }
  }

  if (schema.items) {
    const itemSchemas = Array.isArray(schema.items) ? schema.items : [schema.items];
    for (const item of itemSchemas) {
      const child = walkComplexity(item, depth + 1);
      fields += child.fields;
      maxDepth = Math.max(maxDepth, child.maxDepth);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    for (const sub of schema.anyOf) {
      const child = walkComplexity(sub, depth);
      fields += child.fields;
      maxDepth = Math.max(maxDepth, child.maxDepth);
    }
  }

  const defs = schema.$defs || schema.definitions;
  if (defs && typeof defs === "object") {
    for (const key of Object.keys(defs)) {
      const child = walkComplexity(defs[key], depth);
      fields += child.fields;
      maxDepth = Math.max(maxDepth, child.maxDepth);
    }
  }

  return { fields, maxDepth };
}

/** Field-count/nesting-depth heuristic -- independent of provider and of strict-mode structural compatibility. */
export function checkSchemaComplexity(schema: unknown): SchemaComplexityResult {
  if (!schema || typeof schema !== "object") {
    return { fieldCount: 0, maxDepth: 0, withinRecommendedLimits: true };
  }
  const { fields, maxDepth } = walkComplexity(schema, 1);
  const withinRecommendedLimits = fields <= RECOMMENDED_MAX_FIELDS && maxDepth <= RECOMMENDED_MAX_DEPTH;
  return {
    fieldCount: fields,
    maxDepth,
    withinRecommendedLimits,
    reason: withinRecommendedLimits ? undefined
      : `${fields} field${fields === 1 ? "" : "s"} nested ${maxDepth} level${maxDepth === 1 ? "" : "s"} deep -- past ~${RECOMMENDED_MAX_FIELDS} fields or ${RECOMMENDED_MAX_DEPTH} levels, constrained decoding can measurably slow generation and reduce quality on free-form fields. Consider splitting into multiple smaller-schema passes (e.g. separate DAG worker nodes) instead of one large schema.`,
  };
}
