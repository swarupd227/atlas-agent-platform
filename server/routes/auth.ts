import { Router } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";
import {
  getSecurityMode,
  hashPassword,
  comparePassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie,
} from "../auth";
import { storage } from "../storage";
import { authRateLimiter } from "../rate-limits";
import { ssoOrNull, ssoPublicView } from "../sso";

const router = Router();

router.get("/api/openapi.json", (_req, res) => {
  const protocol = _req.headers["x-forwarded-proto"] || _req.protocol;
  const host = _req.headers["x-forwarded-host"] || _req.headers.host;
  const baseUrl = `${protocol}://${host}`;
  import("../openapi").then(({ generateOpenAPISpec }) => {
    res.json(generateOpenAPISpec(baseUrl));
  }).catch((err) => {
    res.status(500).json({ message: err.message });
  });
});

router.get("/api/auth/mode", (_req, res) => {
  // `sso` is there only when single sign-on is configured, so the sign-in page can offer the button.
  const sso = getSecurityMode() === "demo" ? null : ssoPublicView();
  res.json(sso ? { mode: getSecurityMode(), sso } : { mode: getSecurityMode() });
});

router.post("/api/auth/login", authRateLimiter, async (req, res) => {
  if (getSecurityMode() === "demo") {
    return res.json({ success: true, user: { username: "demo", role: "admin", email: null } });
  }
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const valid = await comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // A deployment that signs people in through Microsoft can leave the form to administrators only
    // (a break-glass account). Checked after the password so it says nothing about who exists.
    if (ssoOrNull()?.localLogin === "admins-only" && (user.role || "agent_engineer") !== "admin") {
      return res.status(403).json({ message: "Sign-in with a password is limited to administrators on this deployment. Use Sign in with Microsoft." });
    }
    const token = generateToken({ userId: user.id, username: user.username, role: user.role || "agent_engineer", email: user.email, organizationId: user.organizationId ?? undefined });
    setAuthCookie(res, token);
    return res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, email: user.email, organizationId: user.organizationId } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/api/auth/register", authRateLimiter, async (req, res) => {
  if (getSecurityMode() === "demo") {
    return res.json({ success: true, user: { username: "demo", role: "admin", email: null } });
  }
  try {
    const { username, password, email, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const existingUsers = await db.select().from(users);
    const isBootstrap = existingUsers.length === 0;
    const isAdmin = req.authUser?.role === "admin";
    if (!isBootstrap && !isAdmin) {
      return res.status(403).json({ message: "Only admins can register new users" });
    }
    const hashed = await hashPassword(password);
    const assignedRole = isBootstrap ? "admin" : (role || "agent_engineer");
    const defaultOrg = await storage.seedDefaultOrganization();
    const [newUser] = await db.insert(users).values({
      username,
      password: hashed,
      email: email || null,
      role: assignedRole,
      organizationId: defaultOrg.id,
    }).returning();
    const token = generateToken({ userId: newUser.id, username: newUser.username, role: newUser.role || "agent_engineer", email: newUser.email, organizationId: newUser.organizationId ?? undefined });
    setAuthCookie(res, token);
    return res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role, email: newUser.email, organizationId: newUser.organizationId } });
  } catch (err: any) {
    if (err.message?.includes("unique")) {
      return res.status(409).json({ message: "Username already exists" });
    }
    return res.status(500).json({ message: err.message });
  }
});

router.post("/api/auth/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

router.get("/api/auth/me", (req, res) => {
  if (getSecurityMode() === "demo") {
    const role = req.headers["x-role"] as string || "admin";
    return res.json({ mode: "demo", user: { username: "demo", role, email: null } });
  }
  if (!req.authUser) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  return res.json({ mode: "production", user: req.authUser });
});

export default router;
