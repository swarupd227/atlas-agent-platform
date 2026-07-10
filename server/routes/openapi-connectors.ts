/**
 * OpenAPI → connector import — the no-code half of "REST/OpenAPI → connector
 * builder". Two-step flow, same "preview then explicit create" shape as the
 * AI-assisted agent drafter: parse a spec (URL or pasted text) into a
 * reviewable operation list, then create a real, immediately-callable
 * connector from the operations the user selects.
 *
 * The created "connector" is a synthetic mcpServers row with
 * transportType="rest-proxy" (deliberately not streamable-http/sse, so
 * isRealMcpServer() always returns false for it — the platform must never
 * attempt an MCP JSON-RPC handshake against a plain REST API) plus one
 * mcpServerTools row per selected operation, using the existing
 * annotations={endpoint,method} shape that tool-dispatcher.ts's generic
 * REST-fallback branch already dispatches for real. See
 * server/openapi-import.ts's header comment for why this targets
 * mcpServers/mcpServerTools rather than the toolConnectors table.
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { checkPermission } from "../permissions";
import { assertSafeOutboundUrl, UnsafeUrlError } from "../url-safety";
import { parseOpenApiSpec, OpenApiParseError } from "../openapi-import";
import { insertMcpServerAuthSchema } from "@shared/schema";

const router = Router();

async function safeUrlOrThrow(url: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await assertSafeOutboundUrl(url);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e instanceof UnsafeUrlError ? e.message : "That URL isn't reachable from this action." };
  }
}

// POST /api/openapi-import/parse — fetch/parse only, no DB writes.
router.post("/api/openapi-import/parse", checkPermission("manage_mcp_servers"), async (req, res) => {
  try {
    const { specUrl, specText, baseUrlOverride } = req.body as { specUrl?: string; specText?: string; baseUrlOverride?: string };
    if (!specUrl && !specText) {
      return res.status(400).json({ message: "Provide either specUrl or specText." });
    }

    let rawSpec: string;
    if (specUrl) {
      const check = await safeUrlOrThrow(specUrl);
      if (!check.ok) return res.status(400).json({ message: check.message });
      const resp = await fetch(specUrl, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) return res.status(502).json({ message: `Fetching the spec failed: HTTP ${resp.status}` });
      rawSpec = await resp.text();
    } else {
      rawSpec = specText!;
    }

    let parsed;
    try {
      parsed = parseOpenApiSpec(rawSpec);
    } catch (e: any) {
      if (e instanceof OpenApiParseError) return res.status(422).json({ message: e.message });
      throw e;
    }

    const effectiveBaseUrl = baseUrlOverride || parsed.baseUrl;
    if (effectiveBaseUrl) {
      const check = await safeUrlOrThrow(effectiveBaseUrl);
      if (!check.ok) return res.status(400).json({ message: `Spec's API base URL isn't usable: ${check.message}` });
    }

    res.json({ ...parsed, baseUrl: effectiveBaseUrl });
  } catch (e: any) {
    console.error("[openapi-import] parse error:", e.message);
    res.status(500).json({ message: "Failed to parse the OpenAPI spec." });
  }
});

const createOperationSchema = z.object({
  name: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  description: z.string().optional().default(""),
  inputSchema: z.any(),
  riskClassification: z.enum(["low", "medium", "high"]).default("medium"),
});

const createRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  baseUrl: z.string().min(1),
  riskTier: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  operations: z.array(createOperationSchema).min(1),
  auth: z.object({ authType: z.string(), config: z.any() }).optional(),
});

// POST /api/openapi-import/create — real, immediately-callable connector.
router.post("/api/openapi-import/create", checkPermission("manage_mcp_servers"), async (req, res) => {
  try {
    const body = createRequestSchema.parse(req.body);

    const urlCheck = await safeUrlOrThrow(body.baseUrl);
    if (!urlCheck.ok) return res.status(400).json({ message: urlCheck.message });

    const mcpServer = await storage.createMcpServer({
      name: body.name,
      description: body.description || `Imported from OpenAPI — ${body.operations.length} operation(s)`,
      transportType: "rest-proxy",
      url: body.baseUrl,
      riskTier: body.riskTier || "MEDIUM",
      status: "verified",
      healthStatus: "unknown",
    } as any);

    for (const op of body.operations) {
      await storage.createMcpServerTool({
        serverId: mcpServer.id,
        name: op.name,
        description: op.description,
        inputSchema: op.inputSchema,
        enabled: true,
        riskClassification: op.riskClassification,
        annotations: { endpoint: op.path, method: op.method.toUpperCase(), source: "openapi_import" },
      } as any);
    }

    if (body.auth) {
      const authData = insertMcpServerAuthSchema.parse({ ...body.auth, serverId: mcpServer.id });
      await storage.upsertMcpServerAuth(authData);
    }

    await storage.createAuditEvent({
      action: "mcp_server.openapi_imported",
      objectType: "mcp_server",
      objectId: mcpServer.id,
      actorId: "system",
      details: JSON.stringify({ name: body.name, baseUrl: body.baseUrl, operationCount: body.operations.length, authConfigured: !!body.auth }),
    });

    res.status(201).json({ mcpServer, toolCount: body.operations.length });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: e.errors });
    console.error("[openapi-import] create error:", e.message);
    res.status(500).json({ message: "Failed to create the connector." });
  }
});

export default router;
