import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";

const state = vi.hoisted(() => ({ users: new Map<string, any>(), settings: new Map<string, any>(), audit: [] as any[] }));
vi.mock("../server/storage", () => ({ storage: {
  getUser: async (id: string) => state.users.get(id),
  getUserByUsername: async (name: string) => [...state.users.values()].find(u => u.username === name),
  getLoginUsers: async (org: string) => [...state.users.values()].filter(u => u.organizationId === org).map(({ password, ...u }) => u),
  createUser: async (data: any) => { const user = { id: "created", active: true, ...data }; state.users.set(user.id, user); return user; },
  getPlatformSetting: async (key: string) => state.settings.get(key),
  getPlatformSettings: async () => [...state.settings.values()],
  upsertPlatformSetting: async (data: any) => { state.settings.set(data.key, data); return data; },
  createAuditEvent: async (event: any) => { state.audit.push(event); return event; },
} }));
vi.mock("../server/auth", () => ({
  getSecurityMode: () => "production", getDefaultOrgId: () => "platform",
  getOrgId: (req: any) => req.authUser?.organizationId,
  hashPassword: async (password: string) => `hashed:${password}`,
}));
import router from "../server/routes/demo-users";
import { DEMO_INDUSTRY_ENABLED_KEY, demoIndustryUserKey } from "../shared/demo-industry-visibility";

let base: string;
let server: ReturnType<ReturnType<typeof express>["listen"]>;
beforeAll(() => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { const role = req.headers["test-role"]; if (role) req.authUser = { userId: String(req.headers["test-user"] ?? "admin"), username: "test", role: String(role), organizationId: String(req.headers["test-org"] ?? "platform"), email: null }; next(); });
  app.use(router); server = app.listen(0); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  state.users.clear(); state.settings.clear(); state.audit.length = 0;
  state.users.set("u1", { id: "u1", username: "hilti.demo1", password: "never-return", role: "agent_engineer", organizationId: "platform", active: true });
  state.users.set("u2", { id: "u2", username: "finance.demo1", role: "agent_engineer", organizationId: "platform", active: true });
  state.users.set("other", { id: "other", username: "other-client", role: "agent_engineer", organizationId: "other", active: true });
});
async function call(method: string, path: string, body?: unknown, role = "admin", org = "platform", user = "admin") {
  const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "test-role": role, "test-org": org, "test-user": user }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie") };
}
const assignment = { clientLabel: "Hilti", allowedIndustryIds: ["manufacturing", "custom"], defaultIndustryId: "manufacturing" };

describe("real demo users and industry assignments", () => {
  it("rejects non-admin and another organization's admin without writes", async () => {
    expect((await call("PUT", "/api/admin/demo-users/settings", { enabled: true }, "agent_engineer")).status).toBe(403);
    expect((await call("PUT", "/api/admin/demo-users/settings", { enabled: true }, "admin", "other")).status).toBe(403);
    expect(state.settings.size).toBe(0);
  });
  it("lists real login users without password hashes or another organization's accounts", async () => {
    const result = await call("GET", "/api/admin/demo-users");
    expect(result.status).toBe(200);
    expect(result.body.users.map((u: any) => u.username)).toEqual(["hilti.demo1", "finance.demo1"]);
    expect(JSON.stringify(result.body)).not.toContain("never-return");
  });
  it("updates one user without replacing another user's assignment, and audits it", async () => {
    state.settings.set(demoIndustryUserKey("u2"), { key: demoIndustryUserKey("u2"), value: JSON.stringify({ ...assignment, clientLabel: "Finance" }) });
    expect((await call("PUT", "/api/admin/demo-users/u1/industry-visibility", assignment)).status).toBe(200);
    expect(JSON.parse(state.settings.get(demoIndustryUserKey("u2")).value).clientLabel).toBe("Finance");
    expect(state.audit).toEqual([expect.objectContaining({ action: "demo.industry_assignment_set", objectId: "u1" })]);
  });
  it("derives the effective assignment from the signed-in user, ignoring a requested user ID", async () => {
    state.settings.set(DEMO_INDUSTRY_ENABLED_KEY, { value: "true" });
    state.settings.set(demoIndustryUserKey("u1"), { value: JSON.stringify(assignment) });
    const one = await call("GET", "/api/demo/industry-visibility?userId=u2", undefined, "agent_engineer", "platform", "u1");
    expect(one.body).toMatchObject({ enabled: true, configured: true, allowedIndustryIds: ["manufacturing", "custom"] });
    const two = await call("GET", "/api/demo/industry-visibility", undefined, "agent_engineer", "platform", "u2");
    expect(two.body).toMatchObject({ enabled: true, configured: false, allowedIndustryIds: [] });
  });
  it("restores normal visibility when disabled and keeps the administrator unrestricted", async () => {
    expect((await call("GET", "/api/demo/industry-visibility", undefined, "agent_engineer", "platform", "u1")).body.enabled).toBe(false);
    state.settings.set(DEMO_INDUSTRY_ENABLED_KEY, { value: "true" });
    expect((await call("GET", "/api/demo/industry-visibility")).body).toMatchObject({ canManage: true, enabled: true });
  });
  it("rejects invalid assignments and cross-organization targets", async () => {
    expect((await call("PUT", "/api/admin/demo-users/u1/industry-visibility", { ...assignment, allowedIndustryIds: [] })).status).toBe(400);
    expect((await call("PUT", "/api/admin/demo-users/other/industry-visibility", assignment)).status).toBe(404);
    expect(state.settings.size).toBe(0);
  });
  it("creates a real non-admin login without replacing the administrator cookie or exposing the password", async () => {
    const result = await call("POST", "/api/admin/demo-users", { username: "new.demo", password: "LongEnoughDemoPass123!", ...assignment });
    expect(result.status).toBe(201); expect(result.cookie).toBeNull();
    expect(state.users.get("created")).toMatchObject({ username: "new.demo", role: "agent_engineer", organizationId: "platform", password: "hashed:LongEnoughDemoPass123!" });
    expect(result.body.user).toMatchObject({ id: "created", username: "new.demo", role: "agent_engineer" });
    expect(JSON.stringify(result.body)).not.toContain("LongEnoughDemoPass123!");
    expect(JSON.stringify(state.audit)).not.toContain("LongEnoughDemoPass123!");
  });
  it("preserves an existing username and rejects attempts to create an administrator", async () => {
    expect((await call("POST", "/api/admin/demo-users", { username: "hilti.demo1", password: "LongEnoughDemoPass123!", ...assignment })).status).toBe(409);
    expect((await call("POST", "/api/admin/demo-users", { username: "new.demo", password: "LongEnoughDemoPass123!", role: "admin", ...assignment })).status).toBe(400);
    expect(state.users.get("u1").password).toBe("never-return");
  });
});
