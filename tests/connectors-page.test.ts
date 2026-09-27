/**
 * The connectors page, and the health vocabulary it shares with Cowork.
 *
 * The audit behind it (2026-09-27, live): the surface was nine routes over three
 * registries, and its health column showed "healthy" for 113 of 131 connectors
 * while 129 of them had not been probed in over a week and 18 never at all.
 *
 * The defect worth pinning is not the layout, it is the TENSE. "Healthy" is a
 * claim about now; what the platform had was a measurement from weeks ago. So the
 * words are past tense, carry their age, and live in one shared module — a badge
 * and a sentence that disagree about the same connector are worse than either.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { checkedAgo, healthBadge, healthTone, healthWords, isStale, STALE_AFTER_DAYS } from "../shared/connector-health-words";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const page = read("client", "src", "pages", "connectors.tsx");
const route = read("server", "routes", "enterprise-integrations.ts");
const tool = read("server", "astra", "tools", "connectors.ts");

describe("how a connector's health is worded", () => {
  it("is past tense and carries the age, never 'is healthy'", () => {
    expect(healthWords("reachable", 32)).toBe("reachable when last probed, checked 32 days ago");
    expect(healthWords("reachable", 0)).toBe("reachable when last probed, checked today");
    expect(healthWords("unreachable", 1)).toBe("failing its check as of checked yesterday");
    for (const days of [0, 1, 3, 32, 400]) {
      expect(healthWords("reachable", days)).not.toMatch(/\bis healthy\b/);
    }
  });

  it("says a connector nothing has probed has no state, rather than giving it one", () => {
    expect(healthWords("never_checked", null)).toContain("nothing has probed it");
    expect(healthWords("never_checked", null)).toContain("state is unknown");
    expect(checkedAgo(null)).toBe("never checked");
    expect(healthBadge("never_checked")).toBe("Not verified");
  });

  it("colours every state, so none falls through to a neutral badge", () => {
    expect(healthTone("unreachable", 1)).toBe("bad");
    expect(healthTone("never_checked", null)).toBe("warn");
    expect(healthTone("reachable", 1)).toBe("good");
    // The case the audit was about: reachable, but the measurement is old.
    expect(healthTone("reachable", 32)).toBe("warn");
    expect(isStale(STALE_AFTER_DAYS)).toBe(true);
    expect(isStale(STALE_AFTER_DAYS - 1)).toBe(false);
    expect(isStale(null)).toBe(false);
  });
});

describe("one vocabulary, two surfaces", () => {
  it("has the page import the shared words rather than writing its own", () => {
    expect(page).toContain('from "@shared/connector-health-words"');
    expect(page).toContain("healthWords(selected.state, selected.ageDays)");
    expect(page).toContain("healthBadge(c.state)");
    // And no hand-rolled copy of the claim in the page's CODE. Its header comment
    // quotes the audit's own wording, which is where that word belongs.
    const code = page.slice(page.indexOf("import "));
    expect(code).not.toMatch(/"healthy"/i);
    expect(code).not.toMatch(/Healthy<\//);
    expect(code).not.toMatch(/>\s*Healthy\b/);
  });

  it("has Cowork's tools import them too", () => {
    expect(tool).toContain('from "@shared/connector-health-words"');
  });
});

describe("what the page does not pretend", () => {
  it("says the age is the age of the answer, not the state now", () => {
    expect(page).toContain("Nothing re-checks a connector on its own");
  });

  it("says what verifying costs, next to the control that does it", () => {
    expect(page).toContain("calls that system for real, with the credentials stored for it");
  });

  it("marks a mock endpoint, which looked identical to a real system", () => {
    expect(page).toContain("mock endpoint on this host");
    expect(page).toMatch(/badge-mock-/);
  });

  it("offers no control for something the platform cannot do — credentials link out to the page that owns them", () => {
    // Rotating and connecting are the platform page's job; a button here would be
    // a button that does nothing.
    expect(page).toContain("Rotate on the platform page");
    expect(page).toContain("A value is never shown here or in a conversation");
  });

  it("hides the only write from a role that may not manage connectors", () => {
    expect(page).toContain('usePermission("manage_mcp_servers")');
    expect(page).toMatch(/canManage && \(/);
  });
});

describe("who the page lets probe", () => {
  it("gates on the same permission the server enforces, with the same answer per role", async () => {
    // The client's union had no manage_mcp_servers, so this control could only
    // have been gated on a neighbouring permission -- and they disagree for 3 of
    // the 8 roles (compliance_security may manage connectors while being only
    // conditional on blueprints; ops_sre is the reverse). A gate that disagrees
    // with the server either hides a control from someone allowed or offers one
    // that will be refused.
    const { PERMISSION_MATRIX, ACTION_LABELS } = await import("../client/src/components/role-provider");
    const { hasPermission } = await import("../server/permissions");
    const client = PERMISSION_MATRIX as Record<string, Record<string, { access: string }>>;

    const rolesChecked: string[] = [];
    for (const role of Object.keys(client)) {
      const clientAccess = client[role].manage_mcp_servers?.access;
      expect(clientAccess, `client gate for ${role}`).toBeTruthy();
      // What the page does with it: show the control unless the role is denied.
      const pageWouldOffer = clientAccess !== "denied";
      expect(pageWouldOffer, `${role}: page vs server`).toBe(hasPermission(role as any, "manage_mcp_servers"));
      rolesChecked.push(role);
    }
    expect(rolesChecked.length).toBeGreaterThanOrEqual(7);
    // The three the audit turned up, spelled out so a future edit that "tidies"
    // them has to argue with a name rather than a count.
    expect(client.compliance_security.manage_mcp_servers.access).toBe("full");
    expect(client.ops_sre.manage_mcp_servers.access).toBe("denied");
    expect(client.agent_engineer.manage_mcp_servers.access).toBe("conditional");
    expect(ACTION_LABELS.manage_mcp_servers).toBe("Manage connectors");
  });
});

describe("the route behind it", () => {
  it("computes health through the same functions Cowork calls", () => {
    expect(route).toContain('await import("../connector-actions")');
    expect(route).toContain("const health = await connectorHealth(orgId)");
  });

  it("sends credential field NAMES and never a value", () => {
    expect(route).toContain("Field NAMES only; a value never leaves the vault");
    expect(route).toMatch(/credentialFields: \(def\.credentialFields \?\? \[\]\)\.map/);
    expect(route).not.toMatch(/decryptCredentialMap\([^)]*\)[\s\S]{0,200}res\.json\(\{[\s\S]{0,400}connectors/);
  });

  it("guards probing with the permission that manages connectors, since it calls a real system", () => {
    expect(route).toContain('router.post("/api/connectors/:id/verify", checkPermission("manage_mcp_servers")');
  });
});
