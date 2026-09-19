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
import type { Blueprint, McpApp, McpElicitation, McpServer, McpServerAuth } from "@shared/schema";
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

// ── MCP apps and MCP elicitations ────────────────────────────────────────────
//
// Neither table has an organization column. An MCP app belongs to whoever owns
// its MCP server (so a platform catalog server's apps are visible to everyone,
// and changing one needs manage_security, like the server itself). An
// elicitation belongs to its agent's organization, else its server's owner,
// else the default org.

function appVisibleWithServer(server: McpServer | undefined, orgId: string | undefined | null): boolean {
  if (server) return isMcpServerVisibleToOrg(server, orgId);
  // An app whose server is gone is treated as a legacy default-org row.
  const fallback = getDefaultOrgId();
  return !fallback || (!!orgId && orgId === fallback);
}

/** Only the apps whose MCP server the org can see. */
export async function filterMcpAppsForOrg<T extends Pick<McpApp, "serverId">>(apps: T[], orgId: string | undefined | null): Promise<T[]> {
  const servers = new Map<string, McpServer | undefined>();
  for (const id of Array.from(new Set(apps.map((a) => a.serverId)))) servers.set(id, await storage.getMcpServer(id));
  return apps.filter((a) => appVisibleWithServer(servers.get(a.serverId), orgId));
}

/** Mounted at /api/mcp-apps -- the create body, by-server lists and every per-app route. */
export async function mcpAppScope(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = resolveRequestOrgId(req);
    const [first, second, third] = req.path.split("/").filter(Boolean);
    if (!first) {
      // Create: the app hangs off a server the caller may change.
      if (req.method === "POST" && typeof req.body?.serverId === "string") {
        const server = await storage.getMcpServer(req.body.serverId);
        if (server && !(await authorizeMcpServer(req, res, server))) return;
      }
      return next();
    }
    if (first === "by-server") {
      const server = second ? await storage.getMcpServer(second) : undefined;
      if (server && !isMcpServerVisibleToOrg(server, orgId)) return notFound(res, "MCP server");
      return next();
    }

    const app = await storage.getMcpApp(first);
    if (!app) return next();
    const server = await storage.getMcpServer(app.serverId);
    if (!appVisibleWithServer(server, orgId)) return notFound(res, "MCP App");

    const editsApp = !second && (req.method === "PATCH" || req.method === "DELETE");
    if (editsApp && server && !(await authorizeMcpServer(req, res, server))) return;
    if (editsApp && typeof req.body?.serverId === "string" && req.body.serverId !== app.serverId) {
      const target = await storage.getMcpServer(req.body.serverId);
      if (target && !(await authorizeMcpServer(req, res, target))) return;
    }
    // A consent or session id in the path or body must belong to this app.
    if (second === "consent" && third) {
      const consents = await storage.getMcpAppConsents(app.id);
      if (!consents.some((c) => c.id === third)) return notFound(res, "Consent");
    }
    if (second === "bridge" && typeof req.body?.sessionId === "string") {
      const session = await storage.getMcpAppSession(req.body.sessionId);
      if (session && session.appId !== app.id) return notFound(res, "Session");
    }
    next();
  } catch (err) {
    next(err);
  }
}

type ElicitationOwnerFields = Pick<McpElicitation, "agentId" | "serverId">;

/** Resolves elicitation owners, caching agent and server lookups across a list. */
function elicitationOwnerResolver() {
  const agentOrg = new Map<string, string | null | undefined>();
  const serverOrg = new Map<string, string | null | undefined>();
  return async (e: ElicitationOwnerFields): Promise<string | null> => {
    if (e.agentId) {
      if (!agentOrg.has(e.agentId)) {
        const agent = await storage.getAgent(e.agentId);
        agentOrg.set(e.agentId, agent ? (agent.organizationId ?? getDefaultOrgId() ?? null) : undefined);
      }
      const owner = agentOrg.get(e.agentId);
      if (owner !== undefined) return owner;
    }
    if (e.serverId) {
      if (!serverOrg.has(e.serverId)) {
        const server = await storage.getMcpServer(e.serverId);
        serverOrg.set(e.serverId, server ? mcpServerOwnerOrgId(server) : undefined);
      }
      const owner = serverOrg.get(e.serverId);
      if (owner) return owner;
    }
    return getDefaultOrgId() ?? null;
  };
}

function ownerMatches(owner: string | null, orgId: string | undefined | null): boolean {
  // No owner at all only happens on a database with no organization seeded.
  return owner === null || (!!orgId && owner === orgId);
}

/** Only the elicitations that belong to the org. */
export async function filterElicitationsForOrg<T extends ElicitationOwnerFields>(rows: T[], orgId: string | undefined | null): Promise<T[]> {
  const ownerOf = elicitationOwnerResolver();
  const out: T[] = [];
  for (const row of rows) if (ownerMatches(await ownerOf(row), orgId)) out.push(row);
  return out;
}

const ELICITATION_RESERVED = new Set(["pending"]);

/** Mounted at /api/mcp-elicitations -- the create body and every per-elicitation route. */
export async function mcpElicitationScope(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = resolveRequestOrgId(req);
    const [first] = req.path.split("/").filter(Boolean);
    if (!first) {
      if (req.method === "POST") {
        // A new elicitation may only name the caller's own agent and a server it can see.
        const { agentId, serverId } = req.body ?? {};
        if (typeof agentId === "string" && agentId) {
          const agent = await storage.getAgent(agentId);
          if (!agent) return res.status(400).json({ error: "Unknown agent" });
          if (!ownerMatches(agent.organizationId ?? getDefaultOrgId() ?? null, orgId)) return notFound(res, "Agent");
        }
        if (typeof serverId === "string" && serverId) {
          const server = await storage.getMcpServer(serverId);
          if (server && !isMcpServerVisibleToOrg(server, orgId)) return notFound(res, "MCP server");
        }
      }
      return next();
    }
    if (ELICITATION_RESERVED.has(first)) return next();
    const elicitation = await storage.getMcpElicitation(first);
    if (!elicitation) return next();
    if (!ownerMatches(await elicitationOwnerResolver()(elicitation), orgId)) {
      return res.status(404).json({ error: "Elicitation not found" });
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ── Outcomes and their KPIs ──────────────────────────────────────────────────
//
// An outcome belongs to its organizationId (a legacy NULL row to the default
// org). A KPI has no organization column of its own: it belongs to its
// outcome's organization.

function outcomeVisibleToOrg(outcome: { organizationId: string | null }, orgId: string | undefined | null): boolean {
  return ownerMatches(outcome.organizationId ?? getDefaultOrgId() ?? null, orgId);
}

async function authorizeOutcomeId(res: Response, outcomeId: string | undefined, orgId: string | undefined): Promise<boolean> {
  if (!outcomeId) return true;
  const outcome = await storage.getOutcome(outcomeId);
  if (!outcome) return true; // the route answers its own not-found
  if (!outcomeVisibleToOrg(outcome, orgId)) {
    notFound(res, "Outcome");
    return false;
  }
  return true;
}

// Literal segments that share the /api/outcomes/:id shape but are not ids.
const OUTCOME_RESERVED = new Set(["intelligence", "with-kpis", "from-proposal"]);

/** Mounted at /api/outcomes/:id -- every per-outcome route and sub-route. */
export async function outcomeScope(req: Request, res: Response, next: NextFunction) {
  try {
    const id = typeof req.params.id === "string" ? req.params.id : undefined;
    if (!id || OUTCOME_RESERVED.has(id)) return next();
    if (await authorizeOutcomeId(res, id, resolveRequestOrgId(req))) next();
  } catch (err) {
    next(err);
  }
}

/** Mounted at /api/kpis -- a KPI addressed by id, and the outcome a create or update names. */
export async function kpiScope(req: Request, res: Response, next: NextFunction) {
  try {
    const orgId = resolveRequestOrgId(req);
    const [id] = req.path.split("/").filter(Boolean);
    if (id) {
      const kpi = await storage.getKpi(id);
      if (kpi && !(await authorizeOutcomeId(res, kpi.outcomeId, orgId))) return;
    }
    const bodyOutcomeId = req.body && typeof req.body.outcomeId === "string" ? req.body.outcomeId : undefined;
    if (!READ_METHODS.has(req.method) && !(await authorizeOutcomeId(res, bodyOutcomeId, orgId))) return;
    next();
  } catch (err) {
    next(err);
  }
}

/** Only the KPIs of the org's outcomes. */
export async function filterKpisForOrg<T extends { outcomeId: string }>(kpis: T[], orgId: string | undefined | null): Promise<T[]> {
  const outcomeIds = new Set((await storage.getOutcomes(orgId ?? undefined)).map((o) => o.id));
  return kpis.filter((k) => outcomeIds.has(k.outcomeId));
}
