/**
 * Minimal zod (v3) -> JSON Schema conversion for Astra tool inputs.
 *
 * Tools declare their input once, as a zod schema, and it serves both as the
 * validator and as the model-facing parameter schema. Only the subset tool
 * inputs actually use is supported; anything else throws at registration time
 * rather than silently sending the model a wrong schema.
 */
import { z } from "zod";

type JsonSchema = Record<string, unknown>;

function withDescription(schema: JsonSchema, def: { description?: string }): JsonSchema {
  return def.description ? { ...schema, description: def.description } : schema;
}

function convert(schema: z.ZodTypeAny): { json: JsonSchema; optional: boolean } {
  const def = (schema as any)._def as { typeName: string; description?: string } & Record<string, any>;
  switch (def.typeName) {
    case "ZodOptional": {
      const inner = convert(def.innerType);
      return { json: withDescription(inner.json, def), optional: true };
    }
    case "ZodDefault": {
      const inner = convert(def.innerType);
      return { json: withDescription({ ...inner.json, default: def.defaultValue() }, def), optional: true };
    }
    case "ZodNullable": {
      const inner = convert(def.innerType);
      return { json: withDescription({ anyOf: [inner.json, { type: "null" }] }, def), optional: inner.optional };
    }
    case "ZodString":
      return { json: withDescription({ type: "string" }, def), optional: false };
    case "ZodNumber": {
      const isInt = (def.checks ?? []).some((c: { kind: string }) => c.kind === "int");
      return { json: withDescription({ type: isInt ? "integer" : "number" }, def), optional: false };
    }
    case "ZodBoolean":
      return { json: withDescription({ type: "boolean" }, def), optional: false };
    case "ZodEnum":
      return { json: withDescription({ type: "string", enum: def.values }, def), optional: false };
    case "ZodArray":
      return { json: withDescription({ type: "array", items: convert(def.type).json }, def), optional: false };
    case "ZodObject": {
      const shape = def.shape() as Record<string, z.ZodTypeAny>;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const converted = convert(value);
        properties[key] = converted.json;
        if (!converted.optional) required.push(key);
      }
      const json: JsonSchema = { type: "object", properties, additionalProperties: false };
      if (required.length > 0) json.required = required;
      return { json: withDescription(json, def), optional: false };
    }
    default:
      throw new Error(`Astra tool schema: unsupported zod type ${def.typeName}`);
  }
}

/** JSON Schema for a tool's input. The root must be a zod object. */
export function toolInputJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const { json } = convert(schema);
  if (json.type !== "object") throw new Error("Astra tool schema: the input root must be an object");
  return json;
}
