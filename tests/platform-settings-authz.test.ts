/**
 * Platform settings apply to the whole deployment (feature flags for every
 * organization), so only an admin may change one, and each change is audited.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { checkPermission, hasPermission, type RoleId } from "../server/permissions";

const ROLES: RoleId[] = ["admin", "outcome_owner", "agent_engineer", "ops_sre", "compliance_security", "expert_validator", "finance", "domain_expert"];

function callAs(role: RoleId) {
  let status = 200;
  let passed = false;
  const res: any = { status(s: number) { status = s; return res; }, json() { return res; } };
  checkPermission("manage_platform_settings")({ headers: { "x-role": role } } as any, res, () => { passed = true; });
  return { status, passed };
}

describe("manage_platform_settings", () => {
  it("is held by admin only", () => {
    expect(ROLES.filter((r) => hasPermission(r, "manage_platform_settings"))).toEqual(["admin"]);
  });

  it("lets an admin through and refuses every other role with 403", () => {
    expect(callAs("admin")).toEqual({ status: 200, passed: true });
    for (const role of ROLES.filter((r) => r !== "admin")) expect(callAs(role)).toEqual({ status: 403, passed: false });
  });
});

describe("PUT /api/platform-settings/:key", () => {
  const src = readFileSync(join(__dirname, "..", "server", "routes", "runtime.ts"), "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf('router.put("/api/platform-settings/:key"');
  const handler = src.slice(start, src.indexOf("\n  });", start));

  it("requires the permission", () => {
    expect(handler).toContain('checkPermission("manage_platform_settings")');
  });

  it("keeps the key from the URL and audits the change", () => {
    expect(handler.indexOf("...req.body")).toBeLessThan(handler.indexOf("key: req.params.key"));
    expect(handler).toContain('action: "platform_setting_changed"');
  });
});
