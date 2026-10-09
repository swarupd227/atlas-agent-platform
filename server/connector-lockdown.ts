/**
 * The connector allow-list of the platform lockdown (server/lockdown.ts, connectors.allow), where
 * it touches the database: classifying the row a tool belongs to, and the middleware that refuse to
 * create or change a connector of a type this deployment does not allow.
 *
 * A connector of a disallowed type is never deleted by this: an existing row stays as it is, is
 * not offered to a model, cannot be called, and cannot be edited, only removed. Nothing here
 * writes to the database.
 */
import type { NextFunction, Request, Response } from "express";
import { storage } from "./storage";
import { connectorAllowed, connectorKindOf, connectorsRestricted } from "./lockdown";

/**
 * Runs a gate for one method on exactly the mount path, and not on its sub-paths: a gate is
 * middleware, not a route, so it is mounted with app.use and told which request it is for.
 * (A gate for POST /api/mcp-servers must not fire for POST /api/mcp-servers/:id/initialize.)
 */
export const exactly = (method: "POST" | "PATCH", gate: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.method === method && (req.path === "/" || req.path === "") ? gate(req, res, next) : next();

function refuse(res: Response, kind: string, why?: string) {
  return res.status(403).json({
    message: why ?? `The "${kind}" connector type is disabled by this deployment's platform policy.`,
    reason: "platform_lockdown",
    surface: `Connector type "${kind}"`,
  });
}

/** Closes a creating route to a connector type this deployment does not allow. */
export function connectorCreateGate(kindOf: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!connectorsRestricted()) return next();
    const kind = kindOf(req);
    return connectorAllowed(kind) ? next() : refuse(res, kind);
  };
}

/**
 * POST /api/mcp-servers registers an arbitrary server, so it is an "mcp" or an "openapi" connector,
 * decided by its transport and nothing else. An integrationId in the body is not honoured under a
 * restriction: classifying by it would let a row name itself an allowed integration while pointing
 * wherever it likes. The platform assigns that field, when it registers its own connectors.
 */
export function registerServerGate(req: Request, res: Response, next: NextFunction) {
  if (!connectorsRestricted()) return next();
  const body = (req.body ?? {}) as { integrationId?: unknown; transportType?: unknown };
  if (body.integrationId) {
    return refuse(res, "mcp", "On this deployment the platform assigns a connector's integrationId; it cannot be set when registering a server.");
  }
  const kind = connectorKindOf({ transportType: typeof body.transportType === "string" ? body.transportType : null });
  return connectorAllowed(kind) ? next() : refuse(res, kind);
}

/**
 * An existing connector of a disallowed type is read-only: no edit, no initialize, no new tools, no
 * new credentials. It can still be read and removed. An edit that would turn an allowed connector into
 * a disallowed type (its transport) is refused too.
 */
export async function mcpServerMutationGate(req: Request, res: Response, next: NextFunction) {
  if (!connectorsRestricted() || !["POST", "PUT", "PATCH"].includes(req.method)) return next();
  let row;
  try {
    row = await storage.getMcpServer(String(req.params.id));
  } catch {
    // A lockdown that cannot tell what a connector is does not let the change through.
    return refuse(res, "unverified", "This connector's type could not be checked against the platform policy, so the change was not made.");
  }
  if (!row) return next();
  const kind = connectorKindOf(row);
  if (!connectorAllowed(kind)) return refuse(res, kind);
  if (req.method === "PATCH") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (row.integrationId) {
      // A platform connector's address and transport are what make it that connector. Left editable,
      // an allowed integration could be repointed anywhere and keep passing as itself.
      for (const field of ["url", "transportType", "command", "args"] as const) {
        if (field in body && JSON.stringify(body[field]) !== JSON.stringify((row as any)[field])) {
          return refuse(res, kind, `On this deployment a platform connector's ${field} cannot be changed.`);
        }
      }
    } else if (typeof body.transportType === "string") {
      const becomes = connectorKindOf({ transportType: body.transportType });
      if (!connectorAllowed(becomes)) return refuse(res, becomes);
    }
  }
  next();
}

/** Installing from the marketplace creates an MCP server, unless the entry is an OpenAPI one (created on a later call). */
export async function marketplaceInstallGate(req: Request, res: Response, next: NextFunction) {
  if (!connectorsRestricted()) return next();
  const entry = await storage.getMarketplaceServer(String(req.params.id)).catch(() => undefined);
  if (!entry || entry.sourceKind === "native") return next();
  const kind = entry.sourceKind === "openapi" ? "openapi" : "mcp";
  return connectorAllowed(kind) ? next() : refuse(res, kind);
}

/**
 * The connector type a tool's server is, when this deployment does not allow it; null when it is
 * allowed, when connectors are not restricted, or when the tool does not belong to a connector row
 * (the built-in document and skill tools).
 */
export async function blockedConnectorKind(serverId: string): Promise<string | null> {
  if (!connectorsRestricted()) return null;
  let row;
  try {
    row = await storage.getMcpServer(serverId);
  } catch {
    // Not finding a row means the tool is not a connector's (a built-in one). Failing to look is
    // different: under a lockdown that blocks, it does not wave the call through.
    return "unverified";
  }
  if (!row) return null;
  const kind = connectorKindOf(row);
  return connectorAllowed(kind) ? null : kind;
}
