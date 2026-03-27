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
  res.json({ mode: getSecurityMode() });
});

router.post("/api/auth/login", async (req, res) => {
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
    const token = generateToken({ userId: user.id, username: user.username, role: user.role || "agent_engineer", email: user.email });
    setAuthCookie(res, token);
    return res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, email: user.email } });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

router.post("/api/auth/register", async (req, res) => {
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
    const [newUser] = await db.insert(users).values({
      username,
      password: hashed,
      email: email || null,
      role: assignedRole,
    }).returning();
    const token = generateToken({ userId: newUser.id, username: newUser.username, role: newUser.role || "agent_engineer", email: newUser.email });
    setAuthCookie(res, token);
    return res.json({ success: true, user: { id: newUser.id, username: newUser.username, role: newUser.role, email: newUser.email } });
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
