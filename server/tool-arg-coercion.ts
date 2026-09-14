/**
 * Tool arguments that arrive as JSON text where the tool's schema asks for a
 * list or an object.
 *
 * Models do this with large nested arguments: instead of a JSON array they
 * send a string that contains one. The tool then rejects the call ("Expected
 * array, received string") and, when the model does not recover, nothing is
 * produced. Live: a deck assembler passed fill_document_template's `slides` as
 * a string twice in one run, and the run ended with no deck.
 *
 * The text is unambiguous -- it parses to exactly the type the schema declares
 * -- so it is parsed here, once, for every tool, before the tool sees it.
 * Deliberately narrow: a value is only replaced when the schema declares that
 * property as array or object (and not also as string), and the string parses
 * to that same type. Anything else is passed through untouched, so the tool's
 * own validation still reports it.
 */

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
};

function declaredTypes(schema: JsonSchema | undefined): string[] {
  if (!schema || typeof schema !== "object") return [];
  if (Array.isArray(schema.type)) return schema.type;
  return typeof schema.type === "string" ? [schema.type] : [];
}

function kindOf(value: unknown): "array" | "object" | "other" {
  if (Array.isArray(value)) return "array";
  return value !== null && typeof value === "object" ? "object" : "other";
}

/**
 * JSON text as a model writes it inside a string argument. Strict JSON first.
 * If that fails, one lenient retry: raw line breaks and tabs inside string
 * literals are escaped. That is the typical way nested JSON breaks. Tools ask
 * for "a newline between paragraphs", and once the whole list is wrapped in a
 * string those newlines land in it unescaped, which strict JSON forbids. Live:
 * a deck assembler's fill map (30 slides of multi-paragraph text) was rejected
 * twice with "slides: Expected array, received string" even with the strict
 * parse in place. Anything still invalid returns undefined and goes to the
 * tool's own validation.
 */
function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the lenient pass
  }
  let out = "";
  let inString = false;
  let escaped = false;
  let changed = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      } else if (ch === "\n" || ch === "\r" || ch === "\t") {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : "\\t";
        changed = true;
        continue;
      }
    } else if (ch === "\"") {
      inString = true;
    }
    out += ch;
  }
  if (!changed) return undefined;
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

function coerceValue(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema || typeof schema !== "object") return value;
  const types = declaredTypes(schema);

  let current = value;
  if (typeof current === "string" && !types.includes("string") && (types.includes("array") || types.includes("object"))) {
    const trimmed = current.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = parseJsonText(trimmed);
      const kind = kindOf(parsed);
      if (parsed !== undefined && kind !== "other" && types.includes(kind)) current = parsed;
    }
  }

  if (Array.isArray(current)) {
    const items = schema.items;
    if (!items || Array.isArray(items)) return current;
    let changed = false;
    const next = current.map((item) => {
      const c = coerceValue(item, items);
      if (c !== item) changed = true;
      return c;
    });
    return changed ? next : current;
  }

  if (kindOf(current) === "object") {
    const obj = current as Record<string, unknown>;
    const extra = typeof schema.additionalProperties === "object" ? schema.additionalProperties : undefined;
    if (!schema.properties && !extra) return current;
    let changed = false;
    const next: Record<string, unknown> = { ...obj };
    for (const [key, v] of Object.entries(obj)) {
      const propSchema = schema.properties?.[key] ?? extra;
      if (!propSchema) continue;
      const c = coerceValue(v, propSchema);
      if (c !== v) {
        next[key] = c;
        changed = true;
      }
    }
    return changed ? next : current;
  }

  return current;
}

/**
 * Returns args with any JSON-text list or object parsed where the schema
 * declares one. Returns the same reference when nothing needed parsing.
 */
export function coerceToolArgsToSchema<T extends Record<string, any>>(args: T, inputSchema: unknown): T {
  if (!args || typeof args !== "object" || !inputSchema || typeof inputSchema !== "object") return args;
  return coerceValue(args, { type: "object", ...(inputSchema as JsonSchema) }) as T;
}
