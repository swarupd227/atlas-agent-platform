import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "./db";
import { users, agentApiKeys, agents } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export type SecurityMode = "demo" | "production";

export function getSecurityMode(): SecurityMode {
  const mode = process.env.SECURITY_MODE || "demo";
  return mode === "production" ? "production" : "demo";
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret && getSecurityMode() === "production") {
    console.warn("[auth] WARNING: JWT_SECRET is not set in production mode. Using fallback. Set JWT_SECRET environment variable for security.");
  }
  return secret || "nous-dev-secret-change-in-production";
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

const AUTH_EXEMPT_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/mode",
];

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (getSecurityMode() === "demo") {
    return next();
  }

  if (AUTH_EXEMPT_PATHS.some(p => req.path === p)) {
    return next();
  }

  // ── Bearer API key auth (for CI runners and programmatic access) ────────────
  // Accepts: Authorization: Bearer <api-key>
  // Key is hashed with SHA-256 and looked up in agent_api_keys table.
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
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
          if (!isExpired) {
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

  if (!defaultOrgId) {
    throw new Error("[auth] Cannot seed default admin: defaultOrgId is required but was not provided");
  }

  try {
    const existingUsers = await db.select().from(users);
    if (existingUsers.length > 0) return;

    const hashed = await hashPassword("admin123");
    await db.insert(users).values({
      username: "admin",
      password: hashed,
      email: "admin@nous.ai",
      role: "admin",
      organizationId: defaultOrgId,
    });
    console.log("[auth] Default admin user created — username: admin, password: admin123");
  } catch (err: any) {
    console.error("[auth] Failed to seed default admin:", err.message);
    throw err;
  }
}
