/**
 * What a team run can be given besides its request.
 *
 * A team's state schema names the fields its steps write. A field marked
 * `input: true` is one the run is given at the start instead: the Run dialog
 * draws a form from these fields, the run route checks what came back against
 * them, and the value is seeded into the run's initial state under the field's
 * own name, where every step reads it the way it reads `request`. Shared by the
 * client (the form) and the server (the check), so the two cannot disagree
 * about what a field accepts.
 */
export interface RunInputField {
  name: string;
  /** string | number | boolean | object | array; anything else is treated as string. */
  type: string;
  enum?: string[];
  description?: string;
}

type FieldDefLike = { type?: string; input?: boolean; enum?: unknown; description?: unknown };

/** The fields a run is given, in the schema's order. */
export function inputFields(fields: Record<string, FieldDefLike> | null | undefined): RunInputField[] {
  if (!fields || typeof fields !== "object") return [];
  const out: RunInputField[] = [];
  for (const [name, def] of Object.entries(fields)) {
    if (!def || def.input !== true) continue;
    const options = Array.isArray(def.enum) ? def.enum.filter((v): v is string => typeof v === "string") : [];
    out.push({
      name,
      type: typeof def.type === "string" ? def.type : "string",
      ...(options.length ? { enum: options } : {}),
      ...(typeof def.description === "string" && def.description.trim() ? { description: def.description.trim() } : {}),
    });
  }
  return out;
}

/** A field given nothing is absent from the state, not an empty value. */
const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * The run's input, checked against the fields and coerced where a form can
 * only hand back text: "12" for a number, "true" for a boolean, JSON for an
 * object or a list. A field given nothing is left out. A key no field names
 * is an error, so a typo does not become a silent state entry.
 */
export function validateRunInput(
  fields: Record<string, FieldDefLike> | null | undefined,
  input: unknown,
): { value: Record<string, unknown>; errors: string[] } {
  const value: Record<string, unknown> = {};
  const errors: string[] = [];
  if (input === undefined || input === null) return { value, errors };
  if (typeof input !== "object" || Array.isArray(input)) return { value, errors: ["input must be an object of field values"] };
  const byName = new Map(inputFields(fields).map((f) => [f.name, f]));
  for (const [name, raw] of Object.entries(input as Record<string, unknown>)) {
    const field = byName.get(name);
    if (!field) {
      errors.push(`${name} is not an input of this team`);
      continue;
    }
    if (isBlank(raw)) continue;
    const coerced = coerce(field, raw);
    if (coerced.error) errors.push(`${name}: ${coerced.error}`);
    else value[name] = coerced.value;
  }
  return { value, errors };
}

function coerce(field: RunInputField, raw: unknown): { value?: unknown; error?: string } {
  switch (field.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      return Number.isFinite(n) ? { value: n } : { error: "must be a number" };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true") return { value: true };
      if (raw === "false") return { value: false };
      return { error: "must be true or false" };
    }
    case "object":
    case "array": {
      const noun = field.type === "array" ? "a list" : "an object";
      let v = raw;
      if (typeof raw === "string") {
        try {
          v = JSON.parse(raw);
        } catch {
          return { error: `must be JSON for ${noun}` };
        }
      }
      const ok = field.type === "array" ? Array.isArray(v) : v !== null && typeof v === "object" && !Array.isArray(v);
      return ok ? { value: v } : { error: `must be ${noun}` };
    }
    default: {
      const s = typeof raw === "string" ? raw : typeof raw === "number" || typeof raw === "boolean" ? String(raw) : null;
      if (s === null) return { error: "must be text" };
      if (field.enum && !field.enum.includes(s)) return { error: `must be one of ${field.enum.join(", ")}` };
      return { value: s };
    }
  }
}

/** Thrown by the run setup when the input does not fit the team's fields; a route answers 400 with `errors`. */
export class RunInputError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`The run's input does not fit this team: ${errors.join("; ")}`);
    this.name = "RunInputError";
    this.errors = errors;
  }
}
