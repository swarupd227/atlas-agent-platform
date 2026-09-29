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
import { checkedAgo, checkOffer, checkProves, healthBadge, healthTone, healthWords, isStale, STALE_AFTER_DAYS } from "../shared/connector-health-words";

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

  it("names the check that produced the state, since the checks do not prove the same thing", () => {
    // A mock endpoint answering and a vendor's system answering are both
    // "reachable", and only one of them means a real system is up.
    expect(healthWords("reachable", 0, true, { measuredBy: "mcp_tools_list" })).toContain("completed an MCP handshake and listed its tools");
    expect(healthWords("reachable", 0, true, { measuredBy: "mock_endpoint" })).toContain("the backend this platform serves is still mounted");
    // And a state carried over from before the platform recorded the check — 112
    // connectors on the day this shipped — claims nothing.
    expect(healthWords("reachable", 32, true, { measuredBy: null })).toContain("by a check this platform can no longer identify");
    expect(checkProves("vendor_connection_test")).toContain("credential test");
    expect(checkOffer("mcp_tools_list")).toBe("open an MCP connection and list its tools");
  });

  it("says why nothing can check one, in that connector's own terms", () => {
    const why = "it is a mock this process serves, and none of its endpoints is a read-only one, so nothing can be called without changing something";
    expect(healthWords("never_checked", null, false, { why })).toBe(`cannot be checked — ${why}`);
    expect(healthWords("reachable", 32, false, { why })).toContain(`cannot be re-checked — ${why}`);
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
    expect(page).toContain("healthWords(selected.state, selected.ageDays, selected.canProbe, { measuredBy: selected.measuredBy, why: selected.checkWhy })");
    expect(page).toContain("healthBadge(c.state, c.canProbe)");
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
    expect(page).toContain("That is the age of the answer rather than the state now");
    // It no longer claims nothing re-checks on its own, because now something does
    // — on a cadence that depends on what each check costs.
    expect(page).toContain("The checks run on a schedule, and how often depends on what the check costs");
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
    expect(page).toMatch(/canManage && selected\.canProbe && \(/);
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

describe("a connector nothing can check", () => {
  it("does not offer a control that cannot work, and says why in that connector's own terms", () => {
    expect(page).toContain("Nothing can check it: {selected.checkWhy}");
    expect(page).toContain("cannot be refreshed");
  });

  it("counts them on the page, since 131 of 132 was the live answer before the checks existed", () => {
    expect(page).toContain("Can be checked at all");
    expect(page).toContain("nothing can check");
  });

  it("says what verifying would do for THIS connector, rather than one sentence for all of them", () => {
    expect(page).toContain("checkOffer(selected.checkKind)");
  });
});

describe("what no health check catches", () => {
  it("shows the missing MCP protocol endpoint on the connector and counts it in the header", () => {
    // Without createMcpProtocolRouter a connector's REST routes answer while every
    // agent's protocol call 404s, so a green health answer is actively misleading.
    expect(page).toContain("No MCP protocol endpoint is mounted for this connector");
    expect(page).toContain("No protocol endpoint");
    expect(page).toContain("no agent can call these over MCP");
  });

  it("names the states that name no check, so they are not read as measurements", () => {
    expect(page).toContain("State of unknown origin");
    expect(page).toContain("names no check that produced it");
  });
});

describe("how the checks are chosen and metered", () => {
  const probe = read("server", "connector-health-probe.ts");
  const scan = read("server", "connector-health-scan.ts");
  const transport = read("server", "real-mcp-transport.ts");

  it("stopped selecting only the connectors with a bespoke health path", () => {
    // The whole defect in one line: listTargets filtered on isNotNull(healthCheckPath),
    // and 131 of 132 connectors had none, so the scan probed exactly one of them.
    expect(scan).not.toContain("isNotNull(mcpServers.healthCheckPath)");
    expect(scan).toContain("export async function listProbeTargets()");
  });

  it("asks a real MCP server for its tools, and reports the drift from the catalogue", () => {
    expect(scan).toContain("mcpListTools(server as any, auth as any)");
    expect(probe).toContain("catalogued here, so the two disagree");
  });

  it("runs the vendor test the Connect form runs, from a module a schedule can reach", () => {
    const extracted = read("server", "connector-connection-test.ts");
    expect(extracted).toContain("export async function testConnectionHealth(");
    expect(read("server", "routes", "enterprise-integrations.ts")).toContain('import { testConnectionHealth } from "../connector-connection-test"');
    expect(scan).toContain("export async function vendorConnectionTest(");
    // Recorded where the rest of the platform already reads it from.
    expect(scan).toContain("storage.recordIntegrationTestResult(conn.id, result.healthy");
  });

  it("records which check produced a state, so a stored state can never again claim more than it measured", () => {
    expect(scan).toContain("healthCheckKind: method");
    expect(read("shared", "schema.ts")).toContain('healthCheckKind: text("health_check_kind")');
    expect(read("server", "db.ts")).toContain("ALTER TABLE mcp_servers ADD COLUMN IF NOT EXISTS health_check_kind TEXT");
  });

  it("counts the protocol mounts at the point that does the mounting, so the list cannot drift", () => {
    expect(transport).toContain("mountedIntegrations.add(integrationId)");
    expect(transport).toContain("export function isMcpProtocolMounted(");
  });

  it("writes no state when nothing ran, and meters the check that spends someone's API quota", () => {
    expect(probe).toMatch(/if \(!result\.probed\) \{/);
    expect(probe).toContain("vendor_connection_test: 60 * 60 * 1000");
  });

  it("asks the app what it serves, rather than keeping a list beside sixty mount sites", () => {
    const mounts = read("server", "app-mounts.ts");
    expect(mounts).toContain("export function isPathHandled(");
    // And not knowing must never read as "not mounted".
    expect(mounts).toContain("return sawUsableLayer ? handled : null");
    expect(read("server", "routes.ts")).toContain('(await import("./app-mounts")).recordApp(app)');
  });
});

/**
 * Asking the app which paths it serves.
 *
 * The first version of this filtered Express layers on `layer.name === "router"`,
 * passed locally, and matched NOTHING once deployed: the production bundle is
 * minified, so the handler functions Express takes those names from are renamed.
 * It failed safe — every mount check answered "cannot determine" — so nothing
 * broke, but the check it was written to perform never ran for 56 connectors.
 * These tests reproduce the production condition rather than the local one.
 */
describe("which paths this build serves", () => {
  const buildApp = async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use("/api", (_q: any, _s: any, n: any) => n());     // middleware on a prefix
    const mock = express.Router();
    mock.get("/watchlists", (_q: any, s: any) => s.json({}));
    app.use("/api/mock/watchlist-screening", mock);
    app.use("/demo-api", express.Router());
    return app;
  };

  it("tells a mounted path from an unmounted one", async () => {
    const { recordApp, isPathHandled } = await import("../server/app-mounts");
    recordApp(await buildApp() as any);
    expect(isPathHandled("/api/mock/watchlist-screening")).toBe(true);
    expect(isPathHandled("/demo-api/kinective/envelopes")).toBe(true);
    expect(isPathHandled("/api/mock/this-was-removed")).toBe(false);
  });

  it("still works when the bundler has renamed every layer — the live failure", async () => {
    const { recordApp, isPathHandled } = await import("../server/app-mounts");
    const app: any = await buildApp();
    for (const layer of (app.router ?? app._router).stack) {
      Object.defineProperty(layer, "name", { value: "a", configurable: true });
    }
    recordApp(app);
    expect(isPathHandled("/api/mock/watchlist-screening")).toBe(true);
    expect(isPathHandled("/api/mock/this-was-removed")).toBe(false);
  });

  it("is not fooled by middleware that matches everything under /api", async () => {
    // `app.use("/api", mw)` matches /api/mock/anything. Counting it would make
    // every path look served, which is the failure in the other direction.
    const { recordApp, isPathHandled } = await import("../server/app-mounts");
    const express = (await import("express")).default;
    const app = express();
    app.use("/api", (_q: any, _s: any, n: any) => n());
    recordApp(app as any);
    expect(isPathHandled("/api/mock/anything")).toBe(null);
  });

  it("answers 'cannot determine' rather than 'no' when there is no app at all", async () => {
    const { recordApp, isPathHandled } = await import("../server/app-mounts");
    recordApp(undefined as any);
    expect(isPathHandled("/api/mock/watchlist-screening")).toBe(null);
  });
});

describe("a state is only written by something that checked", () => {
  // Found on the live deployment the day the checks shipped: five writers set
  // health_status and last_health_check without recording a kind, and three of
  // them had contacted nothing at all — reading a tool list out of the
  // in-process registry, keeping an existing catalog, or analysing drift from
  // stored rows. Those writes are exactly how a state with no check behind it
  // comes to exist, which is the defect this whole mechanism removes.
  const runtime = read("server", "routes", "runtime.ts");

  it("records the kind wherever a protocol handshake did happen", () => {
    expect(runtime).toContain('healthCheckKind: "mcp_tools_list"');
    expect(runtime).toContain("Completed an MCP handshake and listed its catalogs");
    expect(runtime).toContain("Listed its tools, resources and prompts over the protocol");
  });

  it("claims health only on the path that contacted the server", () => {
    expect(runtime).toContain('const contacted = discoveredFrom === "mcp"');
    expect(runtime).toMatch(/\.\.\.\(contacted\s*\n\s*\? \{\s*\n\s*healthStatus: "healthy"/);
  });

  it("leaves no writer that sets a state without saying what produced it", () => {
    // Every remaining health_status write must carry a health_check_kind within
    // the same call. A new one that forgets fails here rather than quietly
    // manufacturing another fossil.
    // Checked line-wise rather than by matching the whole call: one of these
    // writes spans twenty lines with a conditional spread, and a fixed-width
    // window silently reported it as a violation.
    const lines = runtime.split("\n");
    const offenders: string[] = [];
    let seen = 0;
    lines.forEach((line, i) => {
      if (!/healthStatus:/.test(line)) return;
      seen++;
      const near = lines.slice(Math.max(0, i - 10), i + 10).join("\n");
      if (!/healthCheckKind:/.test(near)) offenders.push(`line ${i + 1}: ${line.trim().slice(0, 90)}`);
    });
    expect(seen).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
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
