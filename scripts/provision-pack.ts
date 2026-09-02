/**
 * Provisions the VitalEdge / Equipment Dealer vertical via the platform's own
 * HTTP API — no direct database writes, so everything created here is
 * indistinguishable from what a user would build in the UI.
 *
 *   npm run dev                                   # in another terminal
 *   npx tsx scripts/validate-pack.ts         # always run this first
 *   npx tsx scripts/provision-pack.ts
 *
 * Against the deployed environment:
 *   BASE_URL=https://astra-agents-artizent.azurewebsites.net AUTH_TOKEN=... npx tsx scripts/provision-pack.ts
 *
 * Idempotent: every create is preceded by a lookup on natural key (name /
 * externalId), so re-running repairs a partial provision rather than
 * duplicating it. Safe to re-run after a failure.
 */
import { DEALER_JOURNEYS, validateJourneyBindings, journeyInventory } from "../packs/equipment-dealer/journeys";
import {
  DEALER_ONTOLOGY_CONCEPTS,
  DEALER_KB_DEFS,
  DEALER_POLICY_DEFS,
  DEALER_INDUSTRY_ID,
  DEALER_ONTOLOGY_NAME,
} from "../packs/equipment-dealer/ontology";
import { DEALER_PROCESS_FLOWS, validateProcessFlows } from "../packs/equipment-dealer/process-flows";
import { auditToolCoverage } from "../server/integrations/dealer-operations/mcp-server";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN === "1";
/** Azure App Service cold starts can take ~30s; beyond that it is really down. */
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 45_000);

// The deployed app runs SECURITY_MODE=production, where Bearer auth is only
// accepted on /eval/* and MCP paths — every route this script touches
// authenticates by session cookie instead. So we log in and carry the cookie.
let authCookie = "";

async function login(): Promise<boolean> {
  if (DRY_RUN || !ADMIN_PASSWORD) return true;
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      fail(`Login failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 160)}`);
      return false;
    }
    // Node exposes multiple Set-Cookie headers via getSetCookie().
    const raw = (res.headers as any).getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    for (const c of raw as string[]) {
      const m = /auth_token=([^;]+)/.exec(c ?? "");
      if (m) authCookie = `auth_token=${m[1]}`;
    }
    if (!authCookie) {
      fail("Login succeeded but no auth_token cookie was returned.");
      return false;
    }
    return true;
  } catch (e: any) {
    fail(`Login error: ${e?.message ?? e}`);
    return false;
  }
}

let created = 0;
let reused = 0;
let kbAttempted = 0;
let kbLinked = 0;
let kbAlready = 0;
let mcpLinked = 0;
let mcpAlready = 0;
let flowsLinked = 0;
let kbDeduped = 0;
const failures: string[] = [];

function log(msg: string) { console.log(msg); }
function ok(msg: string) { console.log("  ✓ " + msg); }
function skip(msg: string) { console.log("  · " + msg); }
function fail(msg: string) { console.log("  ✗ " + msg); failures.push(msg); }

/**
 * `tolerate` lists status codes that are an expected outcome rather than a
 * failure — 409 from the MCP link route means "already linked", which is
 * success on a re-run and should not be counted against the summary.
 */
async function api<T = any>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  tolerate: number[] = [],
): Promise<T | null> {
  // Under dry run nothing is written and nothing is read. A POST must still
  // return an object carrying an id: `ensure` returns null without one, the
  // caller then hits `continue`, and every downstream step — the agent PATCH,
  // the connector link, the knowledge-base link — is silently skipped. That
  // made the dry run blind to exactly the bugs it should have caught.
  if (DRY_RUN) return (method === "GET" ? [] : { id: `dry-run-${path.split("/").pop()}` }) as T;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authCookie ? { Cookie: authCookie } : {}),
        ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Without a timeout an app that is down or cold-starting makes fetch
      // hang forever, and the run simply never returns — far harder to
      // diagnose than a clear error.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      if (tolerate.includes(res.status)) return null;
      const text = await res.text().catch(() => "");
      fail(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
      return null;
    }
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    fail(`${method} ${path} → ${timedOut ? `no response in ${REQUEST_TIMEOUT_MS / 1000}s — is the app up? try: curl -s "${BASE_URL}/api/integrations/dealer-operations/health"` : err?.message || err}`);
    return null;
  }
}

/** Look up an existing record by a name-ish field; create it only if absent. */
async function ensure(
  label: string,
  listPath: string,
  matcher: (row: any) => boolean,
  createPath: string,
  payload: unknown,
): Promise<string | null> {
  const list = await api<any[]>("GET", listPath);
  const existing = Array.isArray(list) ? list.find(matcher) : null;
  if (existing?.id) {
    reused++;
    skip(`${label} — already present (${existing.id})`);
    return existing.id;
  }
  const res = await api<any>("POST", createPath, payload);
  if (!res) return null;
  created++;
  ok(`${label}${res.id ? ` (${res.id})` : ""}`);
  return res.id ?? null;
}

async function main() {
  log("");
  log("═══════════════════════════════════════════════════════════════");
  log("  VitalEdge / Equipment Dealer vertical provisioner");
  log(`  Target: ${BASE_URL}${DRY_RUN ? "   [DRY RUN]" : ""}`);
  log("═══════════════════════════════════════════════════════════════");

  // ── 0. Refuse to provision a vertical that does not validate ──────────────
  const bindings = validateJourneyBindings();
  const flows = validateProcessFlows();
  if (!bindings.ok || !flows.ok) {
    log("\nRefusing to provision — validation failed. Run:");
    log("  npx tsx scripts/validate-pack.ts");
    process.exit(1);
  }
  const inv = journeyInventory();
  log(`\nTo provision: ${inv.journeys} journeys · ${inv.agents} agents · ${inv.skills} skills · ${inv.mcpServers} connectors (${inv.mcpTools} tools) · ${DEALER_ONTOLOGY_CONCEPTS.length} concepts · ${DEALER_POLICY_DEFS.length} policies · ${inv.evalCases} eval cases`);

  // Authenticate before anything else; against production nothing else works.
  if (!DRY_RUN) {
    if (!ADMIN_PASSWORD) {
      log("\nADMIN_PASSWORD is not set. Against a deployed (SECURITY_MODE=production) app every");
      log("write below will return 401. Export it from deploy/azure/.generated-secrets.env:");
      log("  export ADMIN_PASSWORD=\"$BOOTSTRAP_ADMIN_PASSWORD\"");
      process.exit(1);
    }
    if (!(await login())) {
      log("\nCould not authenticate. Check ADMIN_USER / ADMIN_PASSWORD and that the app is reachable.");
      process.exit(1);
    }
    ok(`Authenticated as ${ADMIN_USER}`);
  }

  // Reachability is already proven by the login above. There is deliberately
  // no separate /api/health probe: that route does not exist, so the SPA
  // catch-all answers it with index.html and a JSON parse of the response
  // fails — which reads as "server unreachable" on a perfectly healthy server.
  if (!DRY_RUN && !authCookie) {
    log("\nNot authenticated, so nothing below would succeed. Check ADMIN_USER / ADMIN_PASSWORD.");
    process.exit(1);
  }

  // ── 1. Ontology ───────────────────────────────────────────────────────────
  log("\n[1/8] Ontology concepts");
  const conceptPayload = DEALER_ONTOLOGY_CONCEPTS.map((c) => ({
    id: c.id,
    industryId: DEALER_INDUSTRY_ID,
    subVerticals: c.subVerticals,
    ontologyName: DEALER_ONTOLOGY_NAME,
    label: c.label,
    category: c.category,
    description: c.description,
    properties: c.properties,
    relationships: c.relationships,
    tags: c.tags,
    synonyms: c.synonyms,
    industryRelevance: c.industryRelevance,
    source: "industry-standard",
  }));
  const bulk = await api("POST", "/api/ontology/concepts/bulk", { concepts: conceptPayload });
  if (bulk) { created += conceptPayload.length; ok(`${conceptPayload.length} concepts under ${DEALER_ONTOLOGY_NAME}`); }

  // ── 2. Knowledge bases ────────────────────────────────────────────────────
  log("\n[2/8] Knowledge bases");
  const kbIds = new Map<string, string>();
  for (const kb of DEALER_KB_DEFS) {
    const id = await ensure(
      kb.name,
      "/api/knowledge-bases",
      (r) => r.name === kb.name,
      "/api/knowledge-bases",
      { name: kb.name, description: kb.description, industry: DEALER_INDUSTRY_ID, status: "active" },
    );
    if (id) kbIds.set(kb.name, id);
  }

  // ── 3. Governance policies ────────────────────────────────────────────────
  log("\n[3/8] Governance policies");
  const policyIds = new Map<string, string>();
  for (const p of DEALER_POLICY_DEFS) {
    const id = await ensure(
      p.name,
      "/api/policies",
      (r) => r.name === p.name,
      "/api/policies",
      {
        name: p.name,
        domain: p.domain,
        description: p.description,
        policyJson: p.policyJson,
        industry: DEALER_INDUSTRY_ID,
        status: "active",
        enforcement: "hard",
      },
    );
    if (id) policyIds.set(p.name, id);
  }

  // ── 4. Real connector ─────────────────────────────────────────────────────
  // There are no mock connectors. The journeys' per-agent tool groupings are
  // documentation; at runtime every agent binds to the ONE real Dealer
  // Operations integration, which is registered on server startup by
  // server/integrations/register.ts and executes real SQL against the summit
  // schema. Per-agent tool scoping is expressed through skill.allowedTools.
  log("\n[4/8] Real Dealer Operations connector");
  const audit = auditToolCoverage();
  if (!audit.ok) {
    fail(`Connector tool coverage is broken: ${JSON.stringify(audit)}`);
  } else {
    ok(`${audit.declared} tools declared, ${audit.implemented} implemented, 0 orphans`);
  }

  const servers = await api<any[]>("GET", "/api/mcp-servers");
  const dealerServer = Array.isArray(servers)
    ? servers.find((r) => r.integrationId === "dealer-operations" || /Dealer Operations \(VitalEdge\)/.test(r.name ?? ""))
    : null;
  const dealerServerId: string | null = dealerServer?.id ?? null;
  if (dealerServerId) {
    ok(`Dealer Operations — ${dealerServerId}`);
    if (dealerServer.status !== "active") {
      skip("Connector is registered but not connected. Configure its credentials under Integrations, then re-run.");
    }
  } else if (!DRY_RUN) {
    fail("Dealer Operations connector is not registered. Start the server (it registers on boot) and ensure server/integrations/register.ts includes dealerOperationsMcpServer.");
  }

  // Which tools each agent is permitted, taken from the journey groupings.
  const toolsForAgent = new Map<string, string[]>();
  for (const j of DEALER_JOURNEYS) {
    for (const a of j.agents) {
      const server = j.mcpServers.find((m) => m.name === a.mcpServerName);
      if (server) toolsForAgent.set(a.externalId, server.tools.map((t) => t.name));
    }
  }
  const toolsForSkill = new Map<string, string[]>();
  for (const j of DEALER_JOURNEYS) {
    for (const a of j.agents) {
      for (const skillName of a.skillNames) {
        toolsForSkill.set(skillName, toolsForAgent.get(a.externalId) ?? []);
      }
    }
  }

  // ── 5. Skills ─────────────────────────────────────────────────────────────
  log("\n[5/8] Skills");
  const skillIds = new Map<string, string>();
  for (const j of DEALER_JOURNEYS) {
    for (const s of j.skills) {
      const id = await ensure(
        s.name,
        "/api/skills",
        (r) => r.name === s.name,
        "/api/skills",
        {
          name: s.name,
          description: s.description,
          industry: DEALER_INDUSTRY_ID,
          domain: s.domain,
          version: "1.0.0",
          author: "VitalEdge Vertical Pack",
          trustTier: "platform-provided",
          tags: s.tags,
          status: "active",
          complexity: "advanced",
          // Real per-agent tool scoping: a skill may only reach the tools its
          // owning agent is entitled to, not all 57.
          allowedTools: toolsForSkill.get(s.name) ?? [],
          requiredMcpServers: ["dealer-operations"],
        },
      );
      if (id) skillIds.set(s.name, id);
    }
  }

  // ── 6. Agents (orchestrator marked as a curated Journey Library entry) ─────
  log("\n[6/8] Agents & journeys");
  const agentIds = new Map<string, string>();
  for (const j of DEALER_JOURNEYS) {
    log(`  ${j.id} — ${j.name}`);
    for (const a of j.agents) {
      const isOrchestrator = a.role === "orchestrator";
      const id = await ensure(
        `    ${a.externalId} ${a.name}`,
        "/api/agents",
        (r) => r.externalId === a.externalId || r.name === a.name,
        "/api/agents",
        {
          // NOTE: agents has no externalId, industry, mcpServerIds or
          // knowledgeBaseIds column. Sending them is silently dropped by Zod,
          // which is how the first run produced agents bound to nothing.
          // Identity is by name; connector and KB links are separate joins,
          // wired immediately below.
          name: a.name,
          description: a.description,
          // The column is agent_type / agentType. A plain `type` key is not on
          // the agents table, so Zod strips it silently and every agent lands
          // as the default "single" — which then makes agent-teams/members
          // reject the orchestrator with "Agent is not a team type".
          agentType: isOrchestrator ? "team" : "single",
          status: "active",
          department: a.department,
          systemPrompt: j.systemPrompts[a.externalId],
          complianceTags: a.complianceTags,
          preloadedSkills: a.skillNames.map((n) => skillIds.get(n)).filter(Boolean),
          // Journey Library surfacing — only orchestrators carry these.
          isCuratedJourney: isOrchestrator,
          journeyIndustryId: isOrchestrator ? DEALER_INDUSTRY_ID : undefined,
          journeySubVertical: isOrchestrator ? j.subVertical : undefined,
          riskTier: "HIGH",
          autonomyMode: "assisted",
          maxToolIterations: 12,
        },
      );
      if (!id) continue;
      agentIds.set(a.externalId, id);

      // `ensure` skips records that already exist, so a re-run after a partial
      // or wrong-payload provision would leave them as they were. Patch the
      // fields that must be right for the journey to work — this is what makes
      // re-running actually repair rather than merely not-duplicate.
      const repair: Record<string, unknown> = {
        agentType: isOrchestrator ? "team" : "single",
        isCuratedJourney: isOrchestrator,
      };
      if (isOrchestrator) {
        repair.journeyIndustryId = DEALER_INDUSTRY_ID;
        repair.journeySubVertical = j.subVertical;
      }
      await api("PATCH", `/api/agents/${id}`, repair);

      // Connector and knowledge-base links are join tables, not columns on the
      // agent. Without these an agent has a system prompt but no tools, which
      // is exactly what the first provisioning run produced.
      if (a.mcpServerName && dealerServerId) {
        const linked = await api<any[]>("GET", `/api/agents/${id}/mcp-servers`);
        const has = Array.isArray(linked) && linked.some((l: any) => (l.serverId ?? l.server_id ?? l.id) === dealerServerId);
        if (has) mcpAlready++;
        if (!has) {
          // 409 means it is already linked — that is success, not a failure.
          const res = await api("POST", `/api/agents/${id}/mcp-servers`, { serverId: dealerServerId, acknowledgeWarnings: true }, [409]);
          if (res !== null) { mcpLinked++; ok(`      ${a.name} → Dealer Operations connector`); }
        }
      }
      if (a.kbName) {
        const kbId = kbIds.get(a.kbName);
        kbAttempted++;
        if (!kbId) {
          // Never skip a binding in silence — that is how ten agents ended up
          // with no knowledge base and nothing said so.
          fail(`${a.name}: knowledge base "${a.kbName}" did not resolve to an id; binding skipped`);
        } else {
          // This route returns { links, knowledgeBases }, NOT a bare array.
          // Treating it as an array made the existence check always false, so
          // every run added another duplicate link.
          const res0 = await api<any>("GET", `/api/agents/${id}/knowledge-bases`);
          const links: any[] = Array.isArray(res0?.links) ? res0.links : Array.isArray(res0) ? res0 : [];
          const mine = links.filter((l: any) => (l.knowledgeBaseId ?? l.knowledge_base_id) === kbId);
          const has = mine.length > 0;
          if (has) {
            kbAlready++;
            // Remove duplicates left by earlier runs; keep the first.
            for (const extra of mine.slice(1)) {
              const del = await api("DELETE", `/api/agents/${id}/knowledge-bases/${extra.id}`);
              if (del !== null) kbDeduped++;
            }
          }
          if (!has) {
            // priority and retrievalConfig carry database defaults, but
            // drizzle-zod still marks notNull-with-default columns as required
            // on insert in some versions, so send them explicitly rather than
            // relying on the default surviving the schema parse.
            const res = await api("POST", `/api/agents/${id}/knowledge-bases`, {
              knowledgeBaseId: kbId,
              priority: 1,
              retrievalConfig: { topK: 5, scoreThreshold: 0.3 },
            });
            if (res !== null) { kbLinked++; ok(`      ${a.name} → KB "${a.kbName}"`); }
          }
        }
      }
    }

    // Wire workers to their orchestrator so the journey renders as a team.
    const orch = j.agents.find((a) => a.role === "orchestrator");
    const orchId = orch ? agentIds.get(orch.externalId) : null;
    if (orchId) {
      // The members route has no duplicate guard — it inserts unconditionally —
      // so read the current roster first or a re-run doubles every worker.
      const current = await api<any[]>("GET", `/api/agent-teams/${orchId}/members`);
      const already = new Set(
        Array.isArray(current) ? current.map((m: any) => m.memberAgentId ?? m.member_agent_id) : []
      );
      for (const w of j.agents.filter((a) => a.role === "worker")) {
        const wid = agentIds.get(w.externalId);
        if (!wid || already.has(wid)) continue;
        await api("POST", "/api/agent-teams/members", { teamAgentId: orchId, memberAgentId: wid, role: "worker" });
      }
      ok(`    team wired: ${j.agents.filter((a) => a.role === "worker").length} workers under ${orch!.externalId}`);
    }
  }

  // ── 7. Blueprints ─────────────────────────────────────────────────────────
  log("\n[7/8] Blueprints");
  for (const j of DEALER_JOURNEYS) {
    for (const b of j.blueprints) {
      await ensure(
        b.name,
        "/api/blueprints",
        (r) => r.name === b.name,
        "/api/blueprints",
        {
          name: b.name,
          description: b.description,
          industry: DEALER_INDUSTRY_ID,
          steps: b.steps,
          status: "active",
        },
      );
    }
  }

  // ── 8. Eval suites ────────────────────────────────────────────────────────
  log("\n[8/8] Eval suites");
  for (const j of DEALER_JOURNEYS) {
    const orch = j.agents.find((a) => a.role === "orchestrator");
    await ensure(
      `${j.evalSuiteName} (${j.evalCases.length} cases)`,
      "/api/evals",
      (r) => r.name === j.evalSuiteName,
      "/api/evals",
      {
        name: j.evalSuiteName,
        description: `Regression suite for ${j.name}. Covers happy path, edge cases, adversarial pressure, and regulatory controls.`,
        industry: DEALER_INDUSTRY_ID,
        agentId: orch ? agentIds.get(orch.externalId) : undefined,
        status: "active",
        testCases: j.evalCases.map((c) => ({
          name: c.name,
          category: c.category,
          inputScenario: c.inputScenario,
          expectedOutput: c.expectedOutput,
          passCriteria: c.passCriteria,
          scorers: c.scorers,
        })),
      },
    );
  }

  // ── Process flows ─────────────────────────────────────────────────────────
  log("\n[+] Process flows");
  for (const j of DEALER_JOURNEYS) {
    const flow = DEALER_PROCESS_FLOWS[j.id];
    if (!flow) continue;
    const orch = j.agents.find((a) => a.role === "orchestrator");
    const teamAgentId = orch ? agentIds.get(orch.externalId) : undefined;
    // nodes/edges must be TOP LEVEL: the route runs normalizeToGraph over the
    // body itself, and isProcessFlowGraph checks body.nodes / body.edges.
    // Nesting them under `graph` makes it return null, which surfaces as
    // "Flow has no steps to save".
    const body = {
      name: flow.name,
      description: `${j.name} — ${flow.nodes.length} steps, ${flow.nodes.filter((n) => n.type === "expert_approval").length} human approval gates.`,
      nodes: flow.nodes,
      edges: flow.edges,
      // Owning journey, so the Journey Library can show this flow on the
      // journey rather than only listing it in the standalone library.
      ...(teamAgentId ? { teamAgentId } : {}),
    };
    const flowId = await ensure(
      `${j.id} flow (${flow.nodes.length} nodes, ${flow.nodes.filter((n) => n.type === "expert_approval").length} human gates)`,
      "/api/process-flows",
      (r) => r.name === flow.name,
      "/api/process-flows",
      body,
    );
    // A flow created before the journey link existed is found by `ensure` and
    // skipped, so PUT the link onto it explicitly — otherwise the Journey
    // Library would keep showing "Add a process flow" for a journey that has
    // one sitting in the library.
    if (flowId && teamAgentId) {
      const res = await api("PUT", `/api/process-flows/${flowId}`, body);
      if (res !== null) flowsLinked++;
    } else if (!teamAgentId) {
      fail(`${j.id}: orchestrator id unavailable, process flow left unlinked`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log("");
  log("═══════════════════════════════════════════════════════════════");
  log(`  Created: ${created}   Reused: ${reused}   Failed: ${failures.length}`);
  log(`  Connector links: ${mcpLinked} new, ${mcpAlready} already present`);
  log(`  Knowledge base links: ${kbLinked} new, ${kbAlready} already present, ${kbAttempted} agents expected one${kbDeduped ? `, ${kbDeduped} duplicate(s) removed` : ""}`);
  log(`  Process flows linked to journeys: ${flowsLinked} of ${DEALER_JOURNEYS.length}`);
  log("═══════════════════════════════════════════════════════════════");
  if (failures.length) {
    log("\nFailures (re-run is safe and will retry only what is missing):");
    for (const f of failures.slice(0, 30)) log("  - " + f);
    if (failures.length > 30) log(`  … and ${failures.length - 30} more`);
    process.exit(1);
  }
  log("\nNext: open the Journey Library, filter Industry = Equipment Dealers & Distribution.");
}

main().catch((e) => { console.error(e); process.exit(1); });
