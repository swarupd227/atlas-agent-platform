/**
 * Custom API tools for a connected OAuth integration.
 *
 * An admin defines a tool in the UI -- a name, an HTTP method, a path template
 * such as /sites/{site_id}/drive/root/children, and its parameters -- and it
 * runs against the integration's API using that connection's saved,
 * auto-refreshed token. No code per tool.
 *
 * Storage reuses mcp_server_tools: each org gets one PRIVATE mcp_servers row
 * per integration (organizationId set, addedBy "custom-tools:<integration>"),
 * so the tools are assignable to agents, governed and audited like every other
 * tool, and never visible to another organization. The REST definition lives
 * in the tool row's annotations.customRest; the dispatcher already routes a
 * tool whose annotations carry enterpriseIntegration to RealMcpBase.callTool,
 * which runs it here when the name is not one of the connector's built-ins.
 *
 * Safety: the host is always the integration's registry apiBaseUrl (never
 * taken from the definition or the arguments), the path may not contain a
 * scheme or ".." , and every substituted value is URL-encoded.
 */
import { z } from "zod";

export type CustomParamLocation = "path" | "query" | "body";

export interface CustomRestParam {
  name: string;
  in: CustomParamLocation;
  type: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
}

export interface CustomRestDef {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params: CustomRestParam[];
  /** Constant query string parameters, e.g. {"$top": "25"}. */
  fixedQuery?: Record<string, string>;
}

const PARAM_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

export const customToolInputSchema = z.object({
  name: z.string().trim().regex(/^[a-z][a-z0-9_]{2,60}$/, "Name must be lowercase letters, digits and underscores, starting with a letter (3-61 characters)"),
  description: z.string().trim().min(5, "Describe what the tool does so an agent knows when to use it").max(600),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().trim().min(2).max(300),
  params: z.array(z.object({
    name: z.string().trim().regex(PARAM_NAME, "Parameter names use letters, digits and underscores"),
    in: z.enum(["path", "query", "body"]),
    type: z.enum(["string", "number", "boolean"]).default("string"),
    description: z.string().trim().max(300).optional(),
    required: z.boolean().optional(),
  })).max(20).default([]),
  fixedQuery: z.record(z.string().max(500)).optional(),
});
export type CustomToolInput = z.infer<typeof customToolInputSchema>;

/** Returns an error message, or null when the definition is safe and consistent. */
export function validateCustomDef(input: CustomToolInput): string | null {
  const { path, params, method } = input;
  if (!path.startsWith("/")) return "Path must start with / (it is relative to the API base URL)";
  if (path.includes("://") || path.includes("..") || path.includes("?") || path.includes("#") || path.includes("\\")) {
    return "Path may not contain a scheme, '..', '?', '#' or a backslash. Put query parameters in the parameter list.";
  }
  const placeholders = Array.from(path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)).map((m) => m[1]);
  const names = new Set<string>();
  for (const p of params) {
    if (names.has(p.name)) return `Parameter '${p.name}' is listed twice`;
    names.add(p.name);
  }
  for (const ph of placeholders) {
    const p = params.find((x) => x.name === ph);
    if (!p) return `Path uses {${ph}} but there is no parameter with that name`;
    if (p.in !== "path") return `Parameter '${ph}' appears in the path, so it must be located in "path"`;
  }
  for (const p of params) {
    if (p.in === "path" && !placeholders.includes(p.name)) return `Parameter '${p.name}' is marked "path" but {${p.name}} is not in the path`;
    if (p.in === "body" && method === "GET") return `A GET request cannot have a body parameter ('${p.name}')`;
  }
  return null;
}

export function toDef(input: CustomToolInput): CustomRestDef {
  return {
    method: input.method,
    path: input.path,
    params: input.params.map((p) => ({ ...p, required: p.required ?? p.in === "path" })),
    ...(input.fixedQuery && Object.keys(input.fixedQuery).length ? { fixedQuery: input.fixedQuery } : {}),
  };
}

export function buildInputSchema(def: CustomRestDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of def.params) {
    properties[p.name] = { type: p.type, ...(p.description ? { description: p.description } : {}) };
    if (p.required || p.in === "path") required.push(p.name);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** Non-GET calls change data, so they are classified high risk for the tool governance gates. */
export function riskFor(method: CustomRestDef["method"]): "low" | "high" {
  return method === "GET" ? "low" : "high";
}

export function readDef(annotations: unknown): CustomRestDef | null {
  const ann = annotations && typeof annotations === "object" ? (annotations as Record<string, any>) : null;
  const d = ann?.customRest;
  if (!d || typeof d !== "object" || typeof d.method !== "string" || typeof d.path !== "string") return null;
  return d as CustomRestDef;
}

const MAX_RESPONSE_CHARS = 40_000;

export type CustomFetcher = (url: string, init: { method: string; body?: string }) => Promise<Response>;

/** Builds the request from a definition + arguments and runs it. Never throws for an HTTP error status. */
export async function runCustomRest(
  def: CustomRestDef,
  args: Record<string, unknown>,
  apiBaseUrl: string,
  fetcher: CustomFetcher,
): Promise<{ ok: boolean; text: string }> {
  for (const p of def.params) {
    const v = args[p.name];
    const missing = v === undefined || v === null || v === "";
    if (p.required && missing) return { ok: false, text: `Missing required argument '${p.name}'` };
  }

  let path = def.path;
  for (const p of def.params.filter((x) => x.in === "path")) {
    path = path.split(`{${p.name}}`).join(encodeURIComponent(String(args[p.name])));
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(def.fixedQuery ?? {})) query.set(k, v);
  for (const p of def.params.filter((x) => x.in === "query")) {
    const v = args[p.name];
    if (v !== undefined && v !== null && v !== "") query.set(p.name, String(v));
  }

  const body: Record<string, unknown> = {};
  for (const p of def.params.filter((x) => x.in === "body")) {
    const v = args[p.name];
    if (v !== undefined && v !== null && v !== "") body[p.name] = v;
  }

  const base = apiBaseUrl.replace(/\/+$/, "");
  // OData names such as $top and $select are conventionally sent unencoded.
  const qs = query.toString().replace(/%24/g, "$");
  const url = `${base}${path}${qs ? `?${qs}` : ""}`;
  const res = await fetcher(url, {
    method: def.method,
    ...(def.method !== "GET" && Object.keys(body).length ? { body: JSON.stringify(body) } : {}),
  });

  const raw = await res.text();
  const text = raw.length > MAX_RESPONSE_CHARS ? `${raw.slice(0, MAX_RESPONSE_CHARS)}\n…[truncated at ${MAX_RESPONSE_CHARS} characters]` : raw;
  if (!res.ok) return { ok: false, text: `HTTP ${res.status} from ${def.method} ${path}: ${text.slice(0, 1500)}` };
  return { ok: true, text: text || `HTTP ${res.status} (no content)` };
}
