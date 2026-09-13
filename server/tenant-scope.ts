/**
 * Tenant scoping for the MCP server catalog and blueprints.
 *
 * Both tables were global: every list returned every tenant's rows, and every
 * /:id route acted on any id it was given. That exposed other clients'
 * connector names, let one tenant link, edit or delete another tenant's
 * connector or blueprint, and -- through GET /api/mcp-servers/:id/auth --
 * return another tenant's decrypted connector credentials.
 *
 * The rules, in one place:
 *
 * MCP servers
 *   owner = organizationId, or
 *           null            for an unowned seeded enterprise connector
 *                           (integrationId set): the platform catalog, or
 *           the default org for any other unowned (legacy) row.
 *   visible  when owner is null or owner is the caller's org.
 *   mutable  when owner is the caller's org; a platform catalog row
 *            (owner null) also needs manage_security, because changing it
 *            changes it for every tenant.
 *
 * Blueprints
 *   owner = organizationId, or the default org for a legacy NULL row.
 *   visible and mutable only by the owner (route permissions still apply).
 *
 * Anything a caller may not see is reported as 404, never 403, so ids from
 * other tenants can't be probed for existence.
 */
import type { Request, Response, NextFunction } from "express";
import type { Blueprint, McpServer, McpServerAuth } from "@shared/schema";
import { storage } from "./storage";
import { getDefaultOrgId, getOrgId } from "./auth";
import { getRequestRole, hasPermission } from "./permissions";

export function resolveRequestOrgId(req: Request): string | undefined {
  return getOrgId(req) ?? getDefaultOrgId();
}

type OwnedServer = Pick<McpServer, "organizationId" | "integrationId">;

/** The owning org of an MCP server row, or null for a platform catalog row. */
export function mcpServerOwnerOrgId(server: OwnedServer): string | null {
  if (server.organizationId) return server.organizationId;
  if (server.integrationId) return null;
  return getDefaultOrgId() ?? null;
}

export function isMcpServerVisibleToOrg(server: OwnedServer, orgId: string | undefined | null): boolean {
  const owner = mcpServerOwnerOrgId(server);
  if (owner === null) return true;
  return !!orgId && owner === orgId;
}

export function blueprintOwnerOrgId(bp: Pick<Blueprint, "organizationId">): string | null {
  return bp.organizationId ?? getDefaultOrgId() ?? null;
}

export function isBlueprintVisibleToOrg(bp: Pick<Blueprint, "organizationId">, orgId: string | undefined | null): boolean {
  const owner = blueprintOwnerOrgId(bp);
  // No owner and no default org at all means a database that has never seeded
  // an organization -- single-tenant by construction, so nothing to isolate.
  if (owner === null) return true;
  return !!orgId && owner === orgId;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The one shape an MCP server's auth record may leave the server in. The UI
 * only ever needs to know what kind of auth is configured and which fields are
 * set -- never the values. Covers both encrypted rows and legacy rows that
 * still hold a plaintext `config`.
 */
export function sanitizeMcpServerAuth(auth: McpServerAuth | null | undefined, decryptedConfig?: Record<string, unknown> | null) {
  if (!auth) return { authType: "none", configuredFields: [] as string[], hasCredentials: false, lastRotated: null, createdAt: null };
  const config = (decryptedConfig ?? (auth.config as Record<string, unknown> | null)) || {};
  const configuredFields = Object.entries(config)
    .filter(([, v]) => v !== null && v !== undefined && String(v) !== "")
    .map(([k]) => k)
    .sort();
  // Token expiry is a timestamp, not a secret, and tells an operator when a
  // connector will start failing.
  const rawExpiry = (config as any).expiresAt ?? (config as any).expires_at;
  return {
    serverId: auth.serverId,
    authType: auth.authType,
    configuredFields,
    hasCredentials: configuredFields.length > 0,
    expiresAt: rawExpiry ? String(rawExpiry) : null,
    lastRotated: auth.lastRotated,
    createdAt: auth.createdAt,
  };
}

function notFound(res: Response, what: string) {
  return res.status(404).json({ message: `${what} not found` });
}

function catalogWriteDenied(res: Response) {
  return res.status(403).json({
    message: "This is a platform catalog connector shared by every organization. Changing it requires the manage_security permission.",
  });
}

/** Enforce visibility and mutability of one MCP server for this request. Returns false once it has responded. */
async function authorizeMcpServer(req: Request, res: Response, server: McpServer): Promise<boolean> {
  const orgId = resolveRequestOrgId(req);
  if (!isMcpServerVisibleToOrg(server, orgId)) {
    notFound(res, "MCP server");
    return false;
  }
  if (!READ_METHODS.has(req.method) && mcpServerOwnerOrgId(server) === null && !hasPermission(getRequestRole(req), "manage_security")) {
    catalogWriteDenied(res);
    return false;
  }
  return true;
}

// Literal second segments that share a prefix with an :id route but are not ids.
const MCP_SERVER_RESERVED = new Set(["tools", "oauth"]);

/** Mounted at /api/mcp-servers/:id -- covers every per-server route, whatever its own param is called. */
export async function mcpServerScope(req: Request, res: Response, next: NextFunction) {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : undefined;
    if (!id || MCP_SERVER_RESERVED.has(id)) return next();
    const server = await storage.getMcpServer(id);
    // Unknown ids fall through so the route answers exactly as it does today.
    if (!server) return next();
    if (await authorizeMcpServer(req, res, server)) next();
  } catch (err) {
    next(err);
  }
}

type ChildKind = "tool" | "resource" | "prompt";

/** Mounted at /api/mcp-tools/:id, /api/tool-catalog/:id, /api/mcp-resources/:id, /api/mcp-prompts/:id. */
export function mcpServerChildScope(kind: ChildKind, reserved: string[] = []) {
  const reservedIds = new Set(reserved);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : undefined;
      if (!id || reservedIds.has(id)) return next();
      const child =
        kind === "tool" ? await storage.getMcpServerToolById(id)
        : kind === "resource" ? await storage.getMcpServerResourceById(id)
        : await storage.getMcpServerPromptById(id);
      if (!child) return next();
      const server = await storage.getMcpServer(child.serverId);
      if (!server) return next();
      if (!isMcpServerVisibleToOrg(server, resolveRequestOrgId(req))) {
        return notFound(res, kind === "tool" ? "Tool" : kind === "resource" ? "Resource" : "Prompt");
      }
      if (await authorizeMcpServer(req, res, server)) next();
    } catch (err) {
      next(err);
    }
  };
}

const BLUEPRINT_RESERVED = new Set(["validate"]);

async function authorizeBlueprintId(req: Request, res: Response, blueprintId: string | undefined): Promise<boolean> {
  if (!blueprintId) return true;
  const bp = await storage.getBlueprint(blueprintId);
  if (!bp) return true; // let the route produce its own not-found
  if (!isBlueprintVisibleToOrg(bp, resolveRequestOrgId(req))) {
    notFound(res, "Blueprint");
    return false;
  }
  return true;
}

/** Mounted at /api/blueprints/:id -- also covers /api/blueprints/:id/team-graph and every sub-route. */
export async function blueprintScope(req: Request, res: Response, next: NextFunction) {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : undefined;
    if (!id || BLUEPRINT_RESERVED.has(id)) return next();
    if (await authorizeBlueprintId(req, res, id)) next();
  } catch (err) {
    next(err);
  }
}

/**
 * Mounted at /api/team-blueprint-nodes and /api/team-blueprint-edges. A node or
 * edge belongs to whatever blueprint it hangs off, so check that blueprint for
 * the element being addressed by id, for ?blueprintId= on lists, and for a
 * body blueprintId on create/update (which would otherwise let an element be
 * attached to -- or moved into -- another tenant's blueprint).
 */
export function teamGraphElementScope(kind: "node" | "edge") {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idSegment = req.path.split("/").filter(Boolean)[0];
      if (idSegment) {
        const element = kind === "node"
          ? await storage.getTeamBlueprintNode(idSegment)
          : await storage.getTeamBlueprintEdge(idSegment);
        if (element && !(await authorizeBlueprintId(req, res, element.blueprintId))) return;
      }
      const queryBlueprintId = typeof req.query.blueprintId === "string" ? req.query.blueprintId : undefined;
      if (!(await authorizeBlueprintId(req, res, queryBlueprintId))) return;
      const bodyBlueprintId = req.body && typeof req.body.blueprintId === "string" ? req.body.blueprintId : undefined;
      if (!(await authorizeBlueprintId(req, res, bodyBlueprintId))) return;
      next();
    } catch (err) {
      next(err);
    }
  };
}
