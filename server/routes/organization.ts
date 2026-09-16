/**
 * The caller's organization profile: its industry, readable by everyone in it,
 * set by admins (manage_security). Industry is a tenant-wide setting -- it is
 * the default for presets, checks, catalogue filtering and every agent created
 * afterwards -- so each change records who made it and is audited.
 */
import { Router } from "express";
import { z } from "zod";
import { checkPermission, getRequestRole, hasPermission } from "../permissions";
import { storage } from "../storage";
import { isKnownIndustry } from "@shared/industry-filter";
import { invalidateTenantIndustry, requestOrgId } from "../industry-context";

const router = Router();

function view(org: any, canSetIndustry: boolean) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    industryId: org.industryId ?? null,
    subVertical: org.subVertical ?? null,
    workspaceConfig: org.workspaceConfig ?? null,
    industrySetAt: org.industrySetAt ?? null,
    industrySetBy: org.industrySetBy ?? null,
    canSetIndustry,
  };
}

router.get("/api/organizations/current", async (req, res) => {
  const orgId = requestOrgId(req);
  if (!orgId) return res.status(403).json({ message: "No organization context." });
  const org = await storage.getOrganization(orgId);
  if (!org) return res.status(404).json({ message: "Organization not found." });
  res.json(view(org, hasPermission(getRequestRole(req), "manage_security")));
});

const industryBody = z.object({
  industryId: z.string().max(64).nullable(),
  subVertical: z.string().max(120).nullable().optional(),
  workspaceConfig: z.record(z.unknown()).nullable().optional(),
});

router.patch("/api/organizations/current", checkPermission("manage_security"), async (req, res) => {
  const orgId = requestOrgId(req);
  if (!orgId) return res.status(403).json({ message: "No organization context." });
  const parsed = industryBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid request", errors: parsed.error.issues });
  const { industryId, subVertical, workspaceConfig } = parsed.data;
  if (industryId !== null && !isKnownIndustry(industryId)) {
    return res.status(400).json({ message: `"${industryId}" isn't an industry this platform knows.` });
  }

  const before = await storage.getOrganization(orgId);
  if (!before) return res.status(404).json({ message: "Organization not found." });
  const actor = req.authUser?.username ?? req.authUser?.userId ?? getRequestRole(req);
  const updated = await storage.setOrganizationIndustry(
    orgId,
    { industryId, subVertical: industryId === null ? null : subVertical ?? null, workspaceConfig },
    actor,
  );
  invalidateTenantIndustry(orgId);

  await storage.createAuditEvent({
    organizationId: orgId,
    actorType: "user",
    actorId: req.authUser?.userId ?? actor,
    action: "org.industry_set",
    objectType: "organization",
    objectId: orgId,
    details: `Industry ${before.industryId ?? "not set"} → ${industryId ?? "not set"}${subVertical ? ` (${subVertical})` : ""}, set by ${actor}`,
  }).catch((err) => console.error("[organization] audit failed:", err?.message));

  res.json(view(updated ?? before, true));
});

export default router;
