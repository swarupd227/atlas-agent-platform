/**
 * Live check that one organization cannot see, change, link or read the
 * credentials of another organization's MCP connectors and blueprints.
 *
 * Run against a deployment after deploying the tenant-isolation change:
 *
 *   source deploy/azure/env.sh          # APP_URL, ADMIN_USER, ADMIN_PASSWORD, DATABASE_URL
 *   npx tsx scripts/verify-tenant-isolation.ts
 *
 * What it does
 *   Org A is the deployment's default organization (the admin's).
 *   Org B is a dedicated test organization, "tenant-isolation-check", created
 *   once and reused -- nothing in the product can create an organization, so
 *   this is the one step done directly in the database.
 *
 *   1. As A's admin: create a canary connector with a fake secret in its auth
 *      config, and a canary blueprint with one graph node.
 *   2. Create a throwaway user, move it into org B with the admin role, and
 *      sign in as it -- an admin, but of the wrong tenant, is the strongest
 *      cross-tenant caller the product allows.
 *   3. As B: every list must omit A's rows; every per-id read, change, link
 *      and credential route must answer 404 (or refuse); AAR invoke-tool must
 *      not run A's connector.
 *   4. As A: the auth route must still work for the owner, with metadata only.
 *   5. No response body, from either user, may contain the fake secret.
 *   6. Clean up the canary rows and disable the throwaway user.
 *
 * Exits 0 when every check passes, 1 otherwise.
 */
import pg from "pg";
import { randomBytes } from "crypto";

const BASE_URL = (process.env.BASE_URL || process.env.APP_URL || "http://localhost:5000").replace(/\/+$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

const TEST_ORG_SLUG = "tenant-isolation-check";
const CANARY_SECRET = `canary-secret-${randomBytes(12).toString("hex")}`;
const RUN = randomBytes(4).toString("hex");

let passed = 0;
let failed = 0;
const bodiesSeen: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`);
  }
}

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login as ${username} failed: HTTP ${res.status} ${await res.text()}`);
  const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  for (const c of setCookies) {
    const m = /auth_token=([^;]+)/.exec(c ?? "");
    if (m) return `auth_token=${m[1]}`;
  }
  throw new Error(`login as ${username} returned no auth_token cookie`);
}

async function call(cookie: string, method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Cookie: cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  bodiesSeen.push(text);
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, text, json };
}

async function main() {
  if (!ADMIN_PASSWORD || !DATABASE_URL) {
    console.error("ADMIN_PASSWORD and DATABASE_URL are required. Run `source deploy/azure/env.sh` first.");
    process.exit(2);
  }
  console.log(`Target: ${BASE_URL}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const db = await pool.connect();

  let canaryServerId: string | null = null;
  let canaryBlueprintId: string | null = null;
  let userBId: string | null = null;
  let agentBId: string | null = null;
  let cookieB = "";

  const cookieA = await login(ADMIN_USER, ADMIN_PASSWORD);

  try {
    // ── 1. Org A canaries ────────────────────────────────────────────────
    console.log("\nSetting up canaries in org A (default organization)");
    const me = await call(cookieA, "GET", "/api/auth/me");
    const orgA = me.json?.user?.organizationId ?? me.json?.organizationId;
    if (!orgA) throw new Error(`could not read org A from /api/auth/me: ${me.text.slice(0, 200)}`);

    const created = await call(cookieA, "POST", "/api/mcp-servers", {
      name: `Tenant isolation canary ${RUN}`,
      description: "Created by scripts/verify-tenant-isolation.ts; deleted at the end of the run.",
      transportType: "streamable-http",
      url: "https://example.invalid/mcp",
    });
    canaryServerId = created.json?.id ?? null;
    check("A can create a connector", created.status === 201 && !!canaryServerId, `HTTP ${created.status} ${created.text.slice(0, 160)}`);
    check("the new connector is owned by org A", created.json?.organizationId === orgA, `organizationId=${created.json?.organizationId}`);

    const authPut = await call(cookieA, "PUT", `/api/mcp-servers/${canaryServerId}/auth`, {
      authType: "bearer_token",
      config: { token: CANARY_SECRET },
    });
    check("A can store auth on its connector", authPut.status === 200, `HTTP ${authPut.status}`);
    check("the auth PUT response does not echo the secret", !authPut.text.includes(CANARY_SECRET));

    const bp = await call(cookieA, "POST", "/api/blueprints", { name: `Tenant isolation canary ${RUN}`, status: "draft" });
    canaryBlueprintId = bp.json?.id ?? null;
    check("A can create a blueprint", bp.status === 201 && !!canaryBlueprintId, `HTTP ${bp.status} ${bp.text.slice(0, 160)}`);
    const node = await call(cookieA, "POST", "/api/team-blueprint-nodes", { blueprintId: canaryBlueprintId, nodeType: "gate", label: "canary" });
    check("A can add a node to its blueprint", node.status === 201, `HTTP ${node.status} ${node.text.slice(0, 160)}`);

    const serversA = await call(cookieA, "GET", "/api/mcp-servers");
    const orgAOwned: string[] = (serversA.json ?? []).filter((s: any) => s.organizationId === orgA).map((s: any) => s.id);
    const dealerServer = (serversA.json ?? []).find((s: any) => s.integrationId === "dealer-operations" && s.organizationId === orgA);

    const agentsA = await call(cookieA, "GET", "/api/agents");
    const agentAId: string | undefined = (agentsA.json ?? [])[0]?.id;

    // ── 2. Org B user ────────────────────────────────────────────────────
    console.log("\nSigning in as an admin of a different organization (org B)");
    const orgRow = await db.query(
      `INSERT INTO organizations (name, slug, plan, status)
       VALUES ('Tenant isolation check (test org)', $1, 'starter', 'active')
       ON CONFLICT (slug) DO UPDATE SET status = 'active'
       RETURNING id`,
      [TEST_ORG_SLUG],
    );
    const orgB: string = orgRow.rows[0].id;
    check("org B is a different organization from org A", orgB !== orgA);

    const usernameB = `tenant-check-${RUN}`;
    const passwordB = randomBytes(18).toString("base64url");
    const reg = await call(cookieA, "POST", "/api/auth/register", { username: usernameB, password: passwordB, role: "admin" });
    userBId = reg.json?.user?.id ?? null;
    if (!userBId) throw new Error(`could not create the org B test user: HTTP ${reg.status} ${reg.text.slice(0, 200)}`);
    await db.query(`UPDATE users SET organization_id = $1 WHERE id = $2`, [orgB, userBId]);
    cookieB = await login(usernameB, passwordB);
    const meB = await call(cookieB, "GET", "/api/auth/me");
    const orgSeenByB = meB.json?.user?.organizationId ?? meB.json?.organizationId;
    check("the org B user's session is in org B", orgSeenByB === orgB, `organizationId=${orgSeenByB}`);

    // ── 3. Cross-tenant attempts as B ────────────────────────────────────
    console.log("\nOrg B must not reach org A's connectors");
    const serversB = await call(cookieB, "GET", "/api/mcp-servers");
    const idsB = new Set((serversB.json ?? []).map((s: any) => s.id));
    check("the connector list omits A's canary", serversB.status === 200 && !idsB.has(canaryServerId));
    check("the connector list contains no row owned by org A", orgAOwned.every((id) => !idsB.has(id)), `${orgAOwned.filter((id) => idsB.has(id)).length} leaked`);
    check("the connector list contains no row owned by any org but B or the catalog",
      (serversB.json ?? []).every((s: any) => s.organizationId == null || s.organizationId === orgB));

    for (const [method, path] of [
      ["GET", `/api/mcp-servers/${canaryServerId}`],
      ["GET", `/api/mcp-servers/${canaryServerId}/auth`],
      ["PATCH", `/api/mcp-servers/${canaryServerId}`],
      ["PUT", `/api/mcp-servers/${canaryServerId}/auth`],
      ["DELETE", `/api/mcp-servers/${canaryServerId}`],
    ] as const) {
      const body = method === "PATCH" ? { name: "taken over" } : method === "PUT" ? { authType: "none", config: {} } : undefined;
      const r = await call(cookieB, method, path, body);
      check(`${method} ${path.replace(canaryServerId!, "<canary>")} -> 404`, r.status === 404, `HTTP ${r.status} ${r.text.slice(0, 120)}`);
    }

    for (const path of ["/api/mcp-tools", "/api/mcp-tools/by-risk", "/api/tool-catalog", "/api/mcp-resources", "/api/mcp-prompts"]) {
      const r = await call(cookieB, "GET", path);
      const leaked = (r.json ?? []).filter((t: any) => orgAOwned.includes(t.serverId) || t.serverId === canaryServerId).length;
      check(`${path} lists nothing from org A's connectors`, r.status === 200 && leaked === 0, `HTTP ${r.status}, ${leaked} leaked`);
    }

    // B gets its own agent, then tries to give it A's connector.
    const agentB = await call(cookieB, "POST", "/api/agents", { name: `Tenant check agent ${RUN}`, description: "tenant isolation check", status: "draft" });
    agentBId = agentB.json?.id ?? null;
    if (agentBId) {
      const link = await call(cookieB, "POST", `/api/agents/${agentBId}/mcp-servers`, { serverId: canaryServerId, acknowledgeWarnings: true });
      check("B cannot link A's connector to its own agent", link.status === 404, `HTTP ${link.status} ${link.text.slice(0, 120)}`);
      if (dealerServer) {
        const invoke = await call(cookieB, "POST", `/api/agents/${agentBId}/aar/invoke-tool`, { tool_name: "get_open_ar", server_id: dealerServer.id, args: {} });
        const ran = invoke.status === 200 && (invoke.json?.success === true || invoke.json?.result != null);
        check("B's agent cannot invoke a tool on A's connector through AAR", !ran, `HTTP ${invoke.status} ${invoke.text.slice(0, 160)}`);
      } else {
        console.log("  SKIP  AAR invoke check (no org-A dealer-operations connector on this deployment)");
      }
    } else {
      console.log(`  SKIP  link/invoke checks (could not create an org B agent: HTTP ${agentB.status})`);
    }
    if (agentAId) {
      const r = await call(cookieB, "GET", `/api/agents/${agentAId}/mcp-servers`);
      check("B cannot list an org A agent's connector links", r.status === 404, `HTTP ${r.status}`);
    }

    console.log("\nOrg B must not reach org A's blueprints");
    const bpsB = await call(cookieB, "GET", "/api/blueprints");
    check("the blueprint list omits A's canary", bpsB.status === 200 && !(bpsB.json ?? []).some((b: any) => b.id === canaryBlueprintId));
    check("the blueprint list contains only org B's blueprints", (bpsB.json ?? []).every((b: any) => b.organizationId === orgB));
    for (const [method, path, body] of [
      ["GET", `/api/blueprints/${canaryBlueprintId}`, undefined],
      ["PATCH", `/api/blueprints/${canaryBlueprintId}`, { name: "taken over" }],
      ["POST", `/api/blueprints/${canaryBlueprintId}/clone`, {}],
      ["GET", `/api/blueprints/${canaryBlueprintId}/team-graph`, undefined],
      ["GET", `/api/team-blueprint-nodes?blueprintId=${canaryBlueprintId}`, undefined],
      ["POST", "/api/team-blueprint-nodes", { blueprintId: canaryBlueprintId, nodeType: "gate", label: "injected" }],
    ] as const) {
      const r = await call(cookieB, method, path, body);
      check(`${method} ${path.replace(canaryBlueprintId!, "<canary>")} -> 404`, r.status === 404, `HTTP ${r.status} ${r.text.slice(0, 120)}`);
    }

    // ── 4. The owner still works ─────────────────────────────────────────
    console.log("\nOrg A keeps working, without secrets in responses");
    const authA = await call(cookieA, "GET", `/api/mcp-servers/${canaryServerId}/auth`);
    check("A can read its connector's auth metadata", authA.status === 200 && authA.json?.authType === "bearer_token", `HTTP ${authA.status} ${authA.text.slice(0, 160)}`);
    check("that metadata lists the configured field", Array.isArray(authA.json?.configuredFields) && authA.json.configuredFields.includes("token"));
    check("that metadata has no config values", authA.json && !("config" in authA.json) && !("configEncrypted" in authA.json));
    const bpA = await call(cookieA, "GET", `/api/blueprints/${canaryBlueprintId}`);
    check("A can still read its blueprint", bpA.status === 200);

    // ── 5. The secret never left the server ──────────────────────────────
    console.log("\nSecret exposure");
    check(`the canary secret appears in none of ${bodiesSeen.length} response bodies`, bodiesSeen.every((b) => !b.includes(CANARY_SECRET)));
  } finally {
    // ── 6. Cleanup ───────────────────────────────────────────────────────
    console.log("\nCleaning up");
    try { if (agentBId && cookieB) await call(cookieB, "DELETE", `/api/agents/${agentBId}`); } catch { /* best effort */ }
    try { if (canaryServerId) await call(cookieA, "DELETE", `/api/mcp-servers/${canaryServerId}`); } catch { /* best effort */ }
    try {
      if (canaryBlueprintId) {
        await db.query(`DELETE FROM team_blueprint_nodes WHERE blueprint_id = $1`, [canaryBlueprintId]);
        await db.query(`DELETE FROM blueprints WHERE id = $1`, [canaryBlueprintId]);
      }
    } catch (e: any) { console.log(`  note: blueprint cleanup failed: ${e.message}`); }
    try {
      if (userBId) {
        // Disable first, so the account is unusable even if the delete is blocked by a reference.
        await db.query(`UPDATE users SET password = $1 WHERE id = $2`, [`disabled:${randomBytes(24).toString("hex")}`, userBId]);
        await db.query(`DELETE FROM users WHERE id = $1`, [userBId]).catch(() => {
          console.log("  note: test user disabled but kept (referenced by other rows)");
        });
      }
    } catch (e: any) { console.log(`  note: user cleanup failed: ${e.message}`); }
    db.release();
    await pool.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nverify-tenant-isolation aborted: ${err.message}`);
  process.exit(1);
});
