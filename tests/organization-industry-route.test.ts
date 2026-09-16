/**
 * GET/PATCH /api/organizations/current (server/routes/organization.ts): anyone
 * in the organization reads its industry; only manage_security sets it, with a
 * known industry, a record of who set it, an audit event and a fresh cache.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const db = vi.hoisted(() => ({
  orgs: new Map<string, any>(),
  audit: [] as any[],
}));

vi.mock("../server/storage", () => ({
  storage: {
    getOrganization: vi.fn(async (id: string) => (db.orgs.has(id) ? { ...db.orgs.get(id) } : undefined)),
    setOrganizationIndustry: vi.fn(async (id: string, v: any, actor: string) => {
      const row = { ...db.orgs.get(id), industryId: v.industryId, subVertical: v.subVertical, industrySetAt: new Date("2026-09-16T10:00:00Z"), industrySetBy: actor };
      db.orgs.set(id, row);
      return { ...row };
    }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
  },
}));

let base = "";
let server: ReturnType<ReturnType<typeof express>["listen"]>;

beforeAll(async () => {
  process.env.SECURITY_MODE = "demo"; // role from X-Role, organization from X-Organization-Id
  const { setDefaultOrgId } = await import("../server/auth");
  setDefaultOrgId("org-default");
  const { default: router } = await import("../server/routes/organization");
  const { getTenantIndustry } = await import("../server/industry-context");
  const app = express();
  app.use(express.json());
  app.use(router);
  app.get("/tenant/:org", async (req, res) => res.json(await getTenantIndustry(req.params.org)));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server?.close());

beforeEach(() => {
  db.orgs.clear();
  db.audit.length = 0;
  db.orgs.set("org-a", { id: "org-a", name: "Summit Equipment", slug: "summit", industryId: null, subVertical: null });
  db.orgs.set("org-b", { id: "org-b", name: "Other Co", slug: "other", industryId: "healthcare", subVertical: null });
});

const call = (method: string, path: string, headers: Record<string, string>, body?: unknown) =>
  fetch(base + path, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, json: await r.json() }));

describe("organization industry", () => {
  it("any role reads its own organization's industry, and learns whether it may change it", async () => {
    const engineer = await call("GET", "/api/organizations/current", { "x-role": "agent_engineer", "x-organization-id": "org-b" });
    expect(engineer).toMatchObject({ status: 200, json: { id: "org-b", industryId: "healthcare", canSetIndustry: false } });
    const admin = await call("GET", "/api/organizations/current", { "x-role": "admin", "x-organization-id": "org-a" });
    expect(admin.json).toMatchObject({ id: "org-a", industryId: null, canSetIndustry: true });
  });

  it("an admin sets it: recorded, audited in the organization, and the cache sees it at once", async () => {
    expect((await call("GET", "/tenant/org-a", {})).json.industryId).toBeNull();
    const r = await call("PATCH", "/api/organizations/current", { "x-role": "admin", "x-organization-id": "org-a" }, { industryId: "equipment_dealer", subVertical: "construction" });
    expect(r).toMatchObject({ status: 200, json: { industryId: "equipment_dealer", subVertical: "construction", industrySetBy: "admin" } });
    expect(db.audit).toEqual([expect.objectContaining({ organizationId: "org-a", action: "org.industry_set", details: expect.stringContaining("not set → equipment_dealer") })]);
    expect((await call("GET", "/tenant/org-a", {})).json.industryId).toBe("equipment_dealer");
  });

  it("refuses roles without manage_security, and industries the platform doesn't know", async () => {
    expect((await call("PATCH", "/api/organizations/current", { "x-role": "agent_engineer", "x-organization-id": "org-a" }, { industryId: "insurance" })).status).toBe(403);
    const unknown = await call("PATCH", "/api/organizations/current", { "x-role": "admin", "x-organization-id": "org-a" }, { industryId: "technology" });
    expect(unknown.status).toBe(400);
    expect(db.orgs.get("org-a").industryId).toBeNull();
    expect(db.audit).toHaveLength(0);
  });

  it("compliance can set it too, and clearing it clears the sub-vertical", async () => {
    await call("PATCH", "/api/organizations/current", { "x-role": "compliance_security", "x-organization-id": "org-b" }, { industryId: null, subVertical: "hospital" });
    expect(db.orgs.get("org-b")).toMatchObject({ industryId: null, subVertical: null });
  });
});
