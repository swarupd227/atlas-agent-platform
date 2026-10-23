import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { getDefaultOrgId, getOrgId, getSecurityMode, hashPassword } from "../auth";
import { checkPermission, platformOnly } from "../permissions";
import { DEMO_INDUSTRY_ENABLED_KEY, DEMO_INDUSTRY_USER_PREFIX, demoIndustryUserKey, demoIndustryAssignmentSchema, type DemoIndustryAssignment } from "@shared/demo-industry-visibility";

const router = Router();
const managesDemo = (req: Request) => !!req.authUser?.userId && req.authUser.role === "admin" && !!getDefaultOrgId() && getOrgId(req) === getDefaultOrgId();
function requireDemoAdmin(req: Request, res: Response, next: NextFunction) {
  if (!managesDemo(req)) return res.status(403).json({ message: "Only a platform administrator can manage demo users." });
  next();
}
async function enabled() { return (await storage.getPlatformSetting(DEMO_INDUSTRY_ENABLED_KEY))?.value === "true"; }
function assignment(value?: string | null): DemoIndustryAssignment | null {
  try { const parsed = demoIndustryAssignmentSchema.safeParse(JSON.parse(value ?? "null")); return parsed.success ? parsed.data : null; } catch { return null; }
}
function publicUser(user: any) {
  return { id: user.id, username: user.username, email: user.email ?? null, role: user.role, active: user.active, organizationId: user.organizationId };
}
async function writeSetting(req: Request, key: string, value: string, action: string, target: string) {
  const previous = await storage.getPlatformSetting(key);
  await storage.upsertPlatformSetting({ key, value, category: "demo_visibility", description: "UI demo visibility only; does not restrict API access." });
  await storage.createAuditEvent({ organizationId: getOrgId(req), actorType: "user", actorId: req.authUser!.userId,
    action, objectType: "user", objectId: target, details: JSON.stringify({ before: previous?.value ?? null, after: value }) });
}

router.get("/api/demo/industry-visibility", async (req, res, next) => {
  try {
    if (!req.authUser?.userId && getSecurityMode() !== "demo") return res.status(401).json({ message: "Sign in to load demo visibility." });
    const isEnabled = await enabled();
    const canManage = managesDemo(req);
    const saved = isEnabled && !canManage && req.authUser?.userId
      ? assignment((await storage.getPlatformSetting(demoIndustryUserKey(req.authUser.userId)))?.value) : null;
    res.json({ enabled: isEnabled, canManage, configured: !!saved, allowedIndustryIds: saved?.allowedIndustryIds ?? [], defaultIndustryId: saved?.defaultIndustryId ?? null });
  } catch (error) { next(error); }
});

router.get("/api/admin/demo-users", platformOnly(checkPermission("manage_security")), requireDemoAdmin, async (req, res, next) => {
  try {
    const [users, settings, isEnabled] = await Promise.all([storage.getLoginUsers(getOrgId(req)!), storage.getPlatformSettings(), enabled()]);
    const assignments = new Map(settings.filter(s => s.key.startsWith(DEMO_INDUSTRY_USER_PREFIX)).map(s => [s.key, assignment(s.value)]));
    res.json({ enabled: isEnabled, users: users.filter(user => user.role !== "admin").map(user => ({ ...publicUser(user), assignment: assignments.get(demoIndustryUserKey(user.id)) ?? null })) });
  } catch (error) { next(error); }
});

router.put("/api/admin/demo-users/settings", platformOnly(checkPermission("manage_security")), requireDemoAdmin, async (req, res, next) => {
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide an enabled boolean." });
  try {
    await writeSetting(req, DEMO_INDUSTRY_ENABLED_KEY, String(parsed.data.enabled), "demo.industry_visibility_set", req.authUser!.userId);
    res.json(parsed.data);
  } catch (error) { next(error); }
});

router.put("/api/admin/demo-users/:id/industry-visibility", platformOnly(checkPermission("manage_security")), requireDemoAdmin, async (req, res, next) => {
  const parsed = demoIndustryAssignmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid industry assignment", errors: parsed.error.issues });
  try {
    const user = await storage.getUser(String(req.params.id));
    if (!user || user.organizationId !== getOrgId(req) || user.role === "admin") return res.status(404).json({ message: "Demo user not found." });
    await writeSetting(req, demoIndustryUserKey(user.id), JSON.stringify(parsed.data), "demo.industry_assignment_set", user.id);
    res.json({ user: publicUser(user), assignment: parsed.data });
  } catch (error) { next(error); }
});

const createBody = z.object({ username: z.string().trim().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/),
  password: z.string().min(16).max(128), email: z.string().email().optional(),
  clientLabel: z.string(), allowedIndustryIds: z.array(z.string()), defaultIndustryId: z.string(),
}).strict();
router.post("/api/admin/demo-users", platformOnly(checkPermission("manage_security")), requireDemoAdmin, async (req, res, next) => {
  const body = createBody.safeParse(req.body);
  if (!body.success) return res.status(400).json({ message: "Provide a username, a password of at least 16 characters, and an industry assignment." });
  const { username, password, email, ...rawAssignment } = body.data;
  const parsed = demoIndustryAssignmentSchema.safeParse(rawAssignment);
  if (!parsed.success) return res.status(400).json({ message: "Invalid industry assignment", errors: parsed.error.issues });
  try {
    if (await storage.getUserByUsername(username)) return res.status(409).json({ message: "That username already exists. Edit its assignment instead." });
    const user = await storage.createUser({ username, password: await hashPassword(password), email: email ?? null, role: "agent_engineer", organizationId: getOrgId(req)!, authSource: "local" });
    await writeSetting(req, demoIndustryUserKey(user.id), JSON.stringify(parsed.data), "demo.user_created", user.id);
    // No auth cookie: creating a user must not sign the administrator in as that user.
    res.status(201).json({ user: publicUser(user), assignment: parsed.data });
  } catch (error: any) {
    if (error?.code === "23505") return res.status(409).json({ message: "That username already exists." });
    next(error);
  }
});
export default router;
