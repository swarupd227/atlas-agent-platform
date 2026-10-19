/**
 * Ratchet: a connector grant goes through the policy check.
 *
 * MEASURED 2026-10-19. `storage.createAgentMcpServer` creates the
 * `agent_mcp_servers` row that gives an agent a connector's tools, and it had
 * **27 call sites of which exactly one** -- POST /api/agents/:id/mcp-servers --
 * sat behind the policy evaluation. Every other path created the grant with no
 * evaluation, no `agent.mcp_policy_mismatch` audit event and no acknowledgement.
 *
 * Which made a policy binding not load-bearing. Six agents were granted a
 * connector through the gated route with a `data_handling` policy bound first,
 * so the check passed on its merits and recorded no waiver -- and rebuilding
 * those teams regranted through `team-build.ts`, ungated, with nothing
 * re-checking the binding. A control that exists on one of 27 doors is a
 * control you cannot rely on having been applied.
 *
 * This test does not assert that every path refuses. It asserts that every path
 * which creates a grant from a *new decision* consults the rule and records the
 * mismatch, and that a new such path cannot be added silently. Refusal stays
 * where a caller can offer the user a choice; a build reports instead, which is
 * that file's existing precedent for a connector it cannot confirm.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SERVER_DIR = path.join(__dirname, "..", "server");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []);
const rel = (f: string) => path.relative(SERVER_DIR, f).split(path.sep).join("/");
const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

/**
 * Demo and live-run fixtures. They provision a scripted demo against mock
 * connectors rather than acting on a user's decision, and most already swallow
 * their own failures with `.catch(() => {})`. Exempt by filename pattern rather
 * than by a list, so a new fixture does not need this file edited -- and so a
 * new ROUTE cannot hide among them.
 */
const isFixture = (p: string) => /(^|\/)demo-routes\.ts$/.test(p) || /-live-run\.ts$/.test(p);

/**
 * Paths that create a grant and do NOT yet consult the rule. Each needs a
 * reason, and the list may only shrink: it is the remaining debt, named, so
 * that "the gate is closed" is never claimed more widely than it is true.
 */
const KNOWN_UNGATED: Record<string, string> = {
  // Copies grants that already exist on the source agent, each of which was
  // evaluated when it was first created. Propagation of a decision already
  // taken, not a new one -- but the clone's own policy bindings are not
  // re-checked against them, so it is debt rather than correct.
  "routes/journeys.ts": "journey clone copies existing grants; propagation, not a new decision",
  // The low-level helper behind Astra's attach_connector tool, which IS gated:
  // it calls assessConnectorLinkWarnings, shows the warnings on a confirm card,
  // freezes the warning set so a change invalidates the confirmation, and
  // writes both agent.mcp_policy_mismatch and agent.mcp_server_linked. Listed
  // here because the helper itself does not evaluate, and asserted below so the
  // claim "its caller gates it" cannot quietly stop being true.
  "astra/services.ts": "linkConnector; gated by its only caller, astra/tools/attach-connector.ts",
};

const GRANT_CALL = /storage\.createAgentMcpServer\s*\(/;
// The rule itself, from the one module it lives in.
const CONSULTS_RULE = /assessConnectorLinkWarnings\s*\(/;

describe("every connector grant consults the policy rule", () => {
  const files = walk(SERVER_DIR);
  const granters = files.filter((f) => GRANT_CALL.test(src(f))).map(rel).sort();

  it("found the grant call sites at all -- an empty scan would pass everything below", () => {
    // The guard this class of check needs: four instruments in two days
    // reported clean because they read nothing. A zero here is not a pass.
    //
    // storage.ts is NOT among these: it DEFINES createAgentMcpServer rather
    // than calling `storage.createAgentMcpServer(`. Asserting it was here cost
    // a failure on correct data -- the same mistake as tuning a guard to a
    // guessed line count instead of a measured one.
    expect(granters.length).toBeGreaterThanOrEqual(15);
    expect(granters).toContain("team-build.ts");
    expect(granters).toContain("routes/agents.ts");
    expect(granters).not.toContain("storage.ts");
  });

  it("names every non-fixture granter as either consulting the rule or known debt", () => {
    const unaccounted = granters
      .filter((p) => !isFixture(p))
      .filter((p) => !(p in KNOWN_UNGATED))
      .filter((p) => !CONSULTS_RULE.test(src(path.join(SERVER_DIR, p))));
    // Named, not counted: the failure should say which file to fix.
    expect(unaccounted).toEqual([]);
  });

  it("keeps the debt list honest -- nothing listed that no longer grants", () => {
    for (const p of Object.keys(KNOWN_UNGATED)) expect(granters).toContain(p);
  });

  it("astra/services.ts is excused only while its caller really does gate it", () => {
    // The excuse in KNOWN_UNGATED is a claim about another file. Assert it,
    // or "gated by its caller" becomes folklore the moment that caller changes.
    const attach = src(path.join(SERVER_DIR, "astra/tools/attach-connector.ts"));
    expect(attach).toMatch(CONSULTS_RULE);
    expect(attach).toMatch(/agent\.mcp_policy_mismatch/);
    expect(attach).toMatch(/ctx\.services\.linkConnector\(/);
    // And nothing else may reach the ungated helper.
    const callers = files.filter((f) => /ctx\.services\.linkConnector\(|services\.linkConnector\(/.test(src(f))).map(rel);
    expect(callers).toEqual(["astra/tools/attach-connector.ts"]);
  });

  it("the two paths that create a grant from a new decision both consult it", () => {
    // team-build grants on every build; routes/agents grants from mcpServerIds
    // and mcpServerNames in the request body. These are the ones a wrong answer
    // reaches a user through, so they are asserted by name rather than by rule.
    for (const p of ["team-build.ts", "routes/agents.ts"]) {
      expect(granters).toContain(p);
      expect(src(path.join(SERVER_DIR, p))).toMatch(CONSULTS_RULE);
      expect(src(path.join(SERVER_DIR, p))).toMatch(/agent\.mcp_policy_mismatch/);
    }
  });

  it("the rule has exactly one definition, so the paths cannot drift apart", () => {
    // routes/runtime.ts carried its own inline copy of the same logic. Two
    // copies of a policy rule is how one of them quietly stops matching.
    const defs = files.filter((f) => /export function assessConnectorLinkWarnings/.test(src(f))).map(rel);
    expect(defs).toEqual(["connector-link.ts"]);
  });
});
