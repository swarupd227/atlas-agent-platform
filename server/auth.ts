import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./db";
import { users, agentApiKeys, agents } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type SecurityMode = "demo" | "production";

export function getSecurityMode(): SecurityMode {
  // Secure by default: demo mode must be explicitly opted into.
  const mode = process.env.SECURITY_MODE || "production";
  return mode === "demo" ? "demo" : "production";
}

// Demo-mode fallback secret: generated once per process, never persisted or
// logged. A hardcoded fallback would let anyone who reads the source forge a
// token against any demo deployment; a random per-process secret means the
// only thing forgeable is a token for *this* running process, and it dies
// with the process. Never used in production (see getJwtSecret below).
let _demoJwtSecret: string | null = null;
function getDemoJwtSecret(): string {
  if (!_demoJwtSecret) {
    _demoJwtSecret = crypto.randomBytes(48).toString("hex");
  }
  return _demoJwtSecret;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (getSecurityMode() === "production") {
    // No insecure fallback in production (startup validation also enforces this).
    throw new Error("[auth] JWT_SECRET must be set in production mode");
  }
  // Demo / local only.
  return getDemoJwtSecret();
}

const TOKEN_EXPIRY = "24h";
const COOKIE_NAME = "auth_token";

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  email: string | null;
  organizationId?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: TokenPayload;
    }
  }
}

let _defaultOrgId: string | undefined;

export function setDefaultOrgId(id: string) {
  _defaultOrgId = id;
}

export function getDefaultOrgId(): string | undefined {
  return _defaultOrgId;
}

export function getOrgId(req: Request): string | undefined {
  if (getSecurityMode() === "demo") {
    const headerOrgId = req.headers["x-organization-id"];
    return typeof headerOrgId === "string" && headerOrgId ? headerOrgId : undefined;
  }
  return req.authUser?.organizationId;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString("hex") === key);
    });
  });
}

// authMiddleware is mounted with app.use("/api", authMiddleware), so
// Express strips the "/api" prefix from req.path inside it -- these must be
// mount-relative (e.g. "/auth/mode", not "/api/auth/mode") or the exemption
// never matches and login/register/mode end up requiring auth themselves.
const AUTH_EXEMPT_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/mode",
];

// Loopback per the actual TCP source address -- unlike req.ip this ignores
// X-Forwarded-For and therefore cannot be spoofed by an external caller.
// Exported for index.ts's demo-surface gate, which applies the same principle.
export function isLoopbackSocket(req: Request): boolean {
  const addr = req.socket?.remoteAddress;
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (getSecurityMode() === "demo") {
    return next();
  }

  // Mock tool backends (/api/mock/*) are called server-to-server by the agent
  // runtime itself (a worker agent invoking its own mock connector endpoints
  // via http://localhost:<port>). Those self-calls carry no browser session,
  // so in production mode they would 401 and every tool call on a mock
  // connector would fail. A genuine loopback TCP origin is the gate: external
  // requests always arrive through the front proxy with a non-loopback
  // source, so these endpoints stay unreachable without auth from outside.
  if (req.path.startsWith("/mock/") && isLoopbackSocket(req)) {
    return next();
  }

  if (AUTH_EXEMPT_PATHS.some(p => req.path === p)) {
    // Best-effort: attach req.authUser if a valid session happens to be
    // present (e.g. an already-logged-in admin hitting /auth/register to
    // invite a new user, which checks req.authUser?.role itself), but never
    // require or reject on one -- these paths must stay reachable with no
    // session at all (anonymous login, bootstrap registration).
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const payload = verifyToken(token);
      if (payload?.organizationId) {
        req.authUser = payload;
      }
    }
    return next();
  }

  // ── Bearer API key auth (for CI runners and programmatic access) ────────────
  // Accepts: Authorization: Bearer <api-key> on /eval/* paths only.
  // Key is hashed with SHA-256 and looked up in agent_api_keys table.
  // The key must have "invoke" or "eval" scope (least-privilege enforcement).
  const pathAllowsBearer = req.path === "/eval" || req.path.startsWith("/eval/");
  const authHeader = req.headers["authorization"];
  if (pathAllowsBearer && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const rawKey = authHeader.slice(7).trim();
    if (rawKey) {
      try {
        const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
        const [apiKey] = await db
          .select()
          .from(agentApiKeys)
          .where(and(eq(agentApiKeys.keyHash, keyHash), eq(agentApiKeys.isActive, true)));

        if (apiKey) {
          const isExpired = apiKey.expiresAt && apiKey.expiresAt <= new Date();
          // Scope enforcement: key must have "invoke" or "eval" scope
          const scopes: string[] = (apiKey.scopes as string[] | null) ?? [];
          const hasRequiredScope = scopes.some(s => s === "invoke" || s === "eval");

          if (!isExpired && hasRequiredScope) {
            // Resolve org from the owning agent
            const [agent] = await db
              .select()
              .from(agents)
              .where(eq(agents.id, apiKey.agentId));

            req.authUser = {
              userId: `apikey:${apiKey.id}`,
              username: `api-key:${apiKey.name}`,
              role: "api",
              email: null,
              organizationId: agent?.organizationId ?? undefined,
            };

            // Update lastUsedAt non-blocking
            db.update(agentApiKeys)
              .set({ lastUsedAt: new Date() })
              .where(eq(agentApiKeys.id, apiKey.id))
              .catch(() => {});

            return next();
          }
        }
      } catch {
        // Fall through to cookie-based auth
      }
    }
  }

  // ── Cookie / JWT auth (for browser sessions) ────────────────────────────────
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  if (!payload.organizationId) {
    return res.status(403).json({ message: "User is not assigned to an organization" });
  }

  req.authUser = payload;
  next();
}

export async function seedDefaultAdmin(defaultOrgId?: string) {
  if (getSecurityMode() !== "production") return;

  // No hardcoded credentials. Seed a bootstrap admin only from an explicit
  // env-provided password; otherwise skip and require API/CLI provisioning.
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!bootstrapPassword) {
    console.warn(
      "[auth] BOOTSTRAP_ADMIN_PASSWORD not set — no bootstrap admin seeded. Provision an admin via the API/CLI.",
    );
    return;
  }

  if (!defaultOrgId) {
    console.warn("[auth] Cannot seed bootstrap admin: no default organization available.");
    return;
  }

  try {
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) return;

    const hashed = await hashPassword(bootstrapPassword);
    await db.insert(users).values({
      username: "admin",
      password: hashed,
      email: "admin@artizent.ai",
      role: "admin",
      organizationId: defaultOrgId,
    });
    // Never log the password.
    console.log("[auth] Bootstrap admin 'admin' created from BOOTSTRAP_ADMIN_PASSWORD.");
  } catch (err: any) {
    console.error("[auth] Failed to seed bootstrap admin:", err.message);
  }
}
