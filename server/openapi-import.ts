/**
 * OpenAPI / Swagger → connector import.
 *
 * Parses an OpenAPI 3.x (or best-effort Swagger 2.0) document into a flat
 * list of operations, each shaped to become one mcpServerTool row. This is
 * pure parsing — no DB writes, no network calls beyond what the caller
 * already fetched. See server/routes/openapi-connectors.ts for the two-step
 * preview → create flow that wraps this.
 *
 * Why mcpServers/mcpServerTools and not the toolConnectors table: toolConnectors
 * has no runtime dispatch path (nothing in tool-dispatcher.ts reads it) and no
 * url column — it's a registry/health-check entity, not an executable one.
 * mcpServerTools with annotations={endpoint,method} already has a real,
 * gated dispatch path (tool-dispatcher.ts's generic REST-fallback branch),
 * so importing into that shape makes every generated tool callable — with
 * policy/rate-limit/idempotency gates applied automatically — the moment
 * it's created, with zero new dispatch code.
 */
import * as yaml from "js-yaml";

export interface ParsedOperation {
  name: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  riskClassification: "low" | "medium" | "high";
}

export interface ParsedOpenApiSpec {
  title: string;
  version: string | null;
  baseUrl: string | null;
  operations: ParsedOperation[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function methodRiskClassification(method: string): "low" | "medium" | "high" {
  const m = method.toLowerCase();
  if (m === "get" || m === "head" || m === "options") return "low";
  if (m === "delete") return "high";
  return "medium"; // post/put/patch/trace — mutating
}

/** Best-effort single-level $ref resolver against components.schemas /
 *  definitions — deliberately shallow (OpenAPI docs can nest refs many
 *  levels deep; a full resolver is a project of its own). Un-resolvable
 *  refs are left as an empty object rather than throwing, so a spec with
 *  one exotic schema doesn't block importing the other 50 operations. */
function resolveRef(ref: string, doc: any): any {
  if (!ref.startsWith("#/")) return {};
  const parts = ref.slice(2).split("/");
  let node = doc;
  for (const part of parts) {
    node = node?.[part];
    if (node === undefined) return {};
  }
  return node;
}

function schemaToProperty(schema: any, doc: any): any {
  if (!schema || typeof schema !== "object") return { type: "string" };
  if (schema.$ref) return schemaToProperty(resolveRef(schema.$ref, doc), doc);
  const out: any = {};
  if (schema.type) out.type = schema.type;
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.format) out.format = schema.format;
  if (schema.items) out.items = schemaToProperty(schema.items, doc);
  return out;
}

function operationName(method: string, path: string, operationId?: string): string {
  if (operationId && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(operationId)) return operationId;
  const slug = path
    .replace(/[{}]/g, "")
    .split("/")
    .filter(Boolean)
    .join("_")
    .replace(/[^a-zA-Z0-9_]/g, "_");
  return `${method.toLowerCase()}_${slug}`.slice(0, 80);
}

export class OpenApiParseError extends Error {}

/** Parses raw spec text (JSON or YAML, OpenAPI 3.x preferred, Swagger 2.0
 *  best-effort) into a flat operation list. Throws OpenApiParseError on
 *  malformed input rather than silently returning an empty result, so the
 *  caller can show a real error instead of "0 operations found". */
export function parseOpenApiSpec(specText: string): ParsedOpenApiSpec {
  let doc: any;
  try {
    doc = JSON.parse(specText);
  } catch {
    try {
      doc = yaml.load(specText);
    } catch (yamlErr: any) {
      throw new OpenApiParseError(`Could not parse as JSON or YAML: ${yamlErr.message}`);
    }
  }
  if (!doc || typeof doc !== "object") throw new OpenApiParseError("Spec did not parse to an object");
  if (!doc.paths || typeof doc.paths !== "object") throw new OpenApiParseError("Spec has no \"paths\" object — not a recognizable OpenAPI/Swagger document");

  const title: string = doc.info?.title || "Imported API";
  const version: string | null = doc.info?.version || null;

  // OpenAPI 3.x: servers[0].url. Swagger 2.0 fallback: scheme://host+basePath.
  let baseUrl: string | null = null;
  if (Array.isArray(doc.servers) && doc.servers[0]?.url) {
    baseUrl = doc.servers[0].url;
  } else if (doc.host) {
    const scheme = Array.isArray(doc.schemes) && doc.schemes.length > 0 ? doc.schemes[0] : "https";
    baseUrl = `${scheme}://${doc.host}${doc.basePath || ""}`;
  }

  const operations: ParsedOperation[] = [];
  for (const [path, pathItem] of Object.entries<any>(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const pathLevelParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op || typeof op !== "object") continue;

      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      const allParams = [...pathLevelParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      for (const param of allParams) {
        const resolved = param.$ref ? resolveRef(param.$ref, doc) : param;
        if (!resolved?.name) continue;
        properties[resolved.name] = {
          ...schemaToProperty(resolved.schema || { type: "string" }, doc),
          in: resolved.in,
          description: resolved.description,
        };
        if (resolved.required) required.push(resolved.name);
      }

      // requestBody (OpenAPI 3.x) — merge the JSON body's top-level properties in.
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema;
      if (bodySchema) {
        const resolvedBody = bodySchema.$ref ? resolveRef(bodySchema.$ref, doc) : bodySchema;
        if (resolvedBody?.properties && typeof resolvedBody.properties === "object") {
          for (const [propName, propSchema] of Object.entries<any>(resolvedBody.properties)) {
            properties[propName] = schemaToProperty(propSchema, doc);
          }
          if (Array.isArray(resolvedBody.required)) required.push(...resolvedBody.required);
        }
      }
      // Swagger 2.0 body parameter fallback.
      const swaggerBodyParam = allParams.find((p: any) => p.in === "body");
      if (swaggerBodyParam?.schema) {
        const resolvedBody = swaggerBodyParam.schema.$ref ? resolveRef(swaggerBodyParam.schema.$ref, doc) : swaggerBodyParam.schema;
        if (resolvedBody?.properties && typeof resolvedBody.properties === "object") {
          for (const [propName, propSchema] of Object.entries<any>(resolvedBody.properties)) {
            properties[propName] = schemaToProperty(propSchema, doc);
          }
          if (Array.isArray(resolvedBody.required)) required.push(...resolvedBody.required);
        }
      }

      operations.push({
        name: operationName(method, path, op.operationId),
        method: method.toUpperCase(),
        path,
        summary: op.summary || "",
        description: op.description || op.summary || `${method.toUpperCase()} ${path}`,
        inputSchema: { type: "object", properties, required: Array.from(new Set(required)) },
        riskClassification: methodRiskClassification(method),
      });
    }
  }

  if (operations.length === 0) throw new OpenApiParseError("No operations found under \"paths\" — is this the right spec?");

  return { title, version, baseUrl, operations };
}
