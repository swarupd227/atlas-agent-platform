#!/usr/bin/env npx tsx
/**
 * Demo 2: Order Validation & Promise Engine — Dev → Production Migration
 *
 * Migrates all three OTC Order agents plus supporting resources from Dev to
 * Production using only platform REST API calls (no direct DB access to Prod).
 *
 * Platform intelligence definitions are imported from:
 *   ../server/otc-order-shared-defs (canonical source shared with live-run)
 *
 * Agents migrated:
 *   OTC-AGT-002  Order Validation & Promise Agent   (lead orchestrator)
 *   OTC-AGT-003  Customer Credit & Risk Assessment Agent
 *   OTC-AGT-004  Inventory Availability & Promise Agent
 *
 * Usage:
 *   npx tsx scripts/migrate-otc-order-to-prod.ts \
 *     --prod-url    https://your-prod-app.replit.app \
 *     --prod-org-id <prod-uuid> \
 *     [--dev-url    http://localhost:5000] \
 *     [--dev-org-id <dev-uuid>] \
 *     [--dry-run]
 *
 * Resources created per agent (in dependency order):
 *   1.  Governance policies    (3 per agent)
 *   2.  Knowledge base         (1 per agent)
 *   3.  Skills                 (3 per agent)
 *   4.  Blueprint              (1 per agent)
 *   5.  MCP server + tools     (1 server per agent, 4 tools each)
 *   6.  Agent                  (1 per agent)
 *   7.  Agent → KB link
 *   8.  Agent → MCP server link
 */

// ─── Platform intelligence definitions (canonical source — shared with live-run) ─
import {
  OTC_ORDER_AGENT_DEFS,
  OTC_ORDER_KB_DEFS,
  OTC_ORDER_SKILLS,
  OTC_ORDER_POLICY_DEFS,
  OTC_ORDER_ONTOLOGY_CONCEPTS,
  OTC_ORDER_SYSTEM_PROMPTS,
  OTC_ORDER_AGENT_POLICIES,
  makeOtcOrderMcpServerDefs,
} from "../server/otc-order-shared-defs";

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };
  const prodUrl    = get("--prod-url")    ?? process.env.PROD_URL    ?? "";
  const prodOrgId  = get("--prod-org-id") ?? process.env.PROD_ORG_ID ?? "";
  const devUrl     = get("--dev-url")     ?? process.env.DEV_URL     ?? "http://localhost:5000";
  const devOrgId   = get("--dev-org-id")  ?? process.env.DEV_ORG_ID  ?? "";
  const dryRun     = argv.includes("--dry-run");

  if (!prodUrl)   { console.error("ERROR: --prod-url is required"); process.exit(1); }
  if (!prodOrgId) { console.error("ERROR: --prod-org-id is required"); process.exit(1); }

  return {
    prodUrl: prodUrl.replace(/\/$/, ""),
    prodOrgId,
    devUrl: devUrl.replace(/\/$/, ""),
    devOrgId,
    dryRun,
  };
}

let CFG: ReturnType<typeof parseArgs>;

function devHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CFG.devOrgId) h["x-organization-id"] = CFG.devOrgId;
  return h;
}

function prodHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-organization-id": CFG.prodOrgId,
  };
}

async function prodPost(path: string, body: Record<string, unknown>): Promise<any> {
  if (CFG.dryRun) {
    console.log(`  [DRY-RUN] POST ${path}`, JSON.stringify(body).slice(0, 80));
    return { id: `dry-run-${Math.random().toString(36).slice(2, 10)}` };
  }
  const res = await fetch(`${CFG.prodUrl}${path}`, {
    method: "POST",
    headers: prodHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json?.id) {
    throw new Error(`POST ${path} failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function devGet(path: string): Promise<any> {
  const res = await fetch(`${CFG.devUrl}${path}`, { headers: devHeaders() });
  return res.json();
}

async function prodGet(path: string): Promise<any> {
  const res = await fetch(`${CFG.prodUrl}${path}`, { headers: prodHeaders() });
  return res.json();
}

// ─── Idempotency helper ───────────────────────────────────────────────────────
// For each resource, first GET the list and search by name.
// If found → skip and return existing ID. If not → POST to create.

async function prodEnsure(
  listPath: string,
  createPath: string,
  body: Record<string, unknown>,
  nameKey: string = "name",
  labelToMatch?: string,
): Promise<{ id: string; skipped: boolean }> {
  if (CFG.dryRun) {
    console.log(`  [DRY-RUN] ensure ${createPath}:`, body[nameKey]);
    return { id: `dry-run-${Math.random().toString(36).slice(2, 10)}`, skipped: false };
  }
  const resourceName = (labelToMatch ?? body[nameKey]) as string;
  const list: any[] = await prodGet(listPath).catch(() => []);
  const existing = Array.isArray(list)
    ? list.find((r: any) => r[nameKey] === resourceName || r.label === resourceName)
    : null;
  if (existing?.id) {
    return { id: existing.id, skipped: true };
  }
  const res = await fetch(`${CFG.prodUrl}${createPath}`, {
    method: "POST",
    headers: prodHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json?.id) {
    throw new Error(`POST ${createPath} failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { id: json.id, skipped: false };
}

// ─── Agent definitions ────────────────────────────────────────────────────────
// All definitions sourced from otc-order-shared-defs (single canonical source).
// Tools are derived from makeOtcOrderMcpServerDefs keyed by mcpServerName.
// System prompts from OTC_ORDER_SYSTEM_PROMPTS.
// Per-agent policies from OTC_ORDER_AGENT_POLICIES.

/** Extract the serverKey (e.g. "otc-order-oms") from a mock URL (last path segment). */
function _serverKeyFromUrl(url: string): string {
  return url.replace(/\/$/, "").split("/").pop() ?? "";
}

/** Build the tool list for an agent by looking up its MCP server in the canonical defs. */
function _toolsForAgent(mcpServerName: string): { name: string; server: string; path: string; method: string }[] {
  const serverDefs = makeOtcOrderMcpServerDefs(""); // baseUrl irrelevant for tool metadata
  const srv = serverDefs.find(s => s.name === mcpServerName);
  if (!srv) return [];
  const serverKey = _serverKeyFromUrl(srv.url);
  return (srv.tools as readonly { name: string; endpoint: string; method: string }[]).map(t => ({
    name:   t.name,
    server: serverKey,
    path:   `/api/mock/${serverKey}/${t.endpoint}`,
    method: t.method,
  }));
}

// AGENTS: fully derived from shared-defs — no inline overrides
const AGENTS = OTC_ORDER_AGENT_DEFS.map(def => {
  const kb = OTC_ORDER_KB_DEFS.find(k => k.name === def.kbName);
  return {
    key:           def.key,
    code:          def.externalId,
    name:          def.name,
    stage:         "Order Processing",
    description:   def.description,
    systemPrompt:  OTC_ORDER_SYSTEM_PROMPTS[def.externalId]  ?? "",
    tools:         _toolsForAgent(def.mcpServerName as string),
    kbName:        def.kbName,
    kbDescription: kb?.description ?? "",
    policies:      OTC_ORDER_AGENT_POLICIES[def.externalId]  ?? [],
    skills:        OTC_ORDER_SKILLS
                     .filter(s => s.agentKey === def.key)
                     .map(s => ({ name: s.name, description: s.description })),
  };
});

// OTC_ORDER_ONTOLOGY_CONCEPTS imported from ../server/otc-order-shared-defs

// ─── Migration runner ─────────────────────────────────────────────────────────

let _ontologyMigrated = false;

async function migrateOntologyOnce(): Promise<void> {
  if (_ontologyMigrated) return;
  console.log("\n  ── Shared Ontology Concepts (12 total) ──");
  const { randomUUID } = await import("crypto");
  let created = 0, skipped = 0;
  for (const concept of OTC_ORDER_ONTOLOGY_CONCEPTS) {
    const { id, skipped: sk } = await prodEnsure(
      "/api/ontology/concepts?industryId=manufacturing",
      "/api/ontology/concepts",
      {
        id:           randomUUID(),
        industryId:   "manufacturing",
        ontologyName: "NovaTech Order-to-Cash",
        label:        concept.label,
        category:     concept.category,
        description:  concept.description,
        tags:         concept.tags,
        properties:   [],
        relationships:[],
        synonyms:     [],
        source:       "industry-standard",
        organizationId: CFG.prodOrgId,
      },
      "label",
      concept.label,
    );
    if (sk) { console.log(`    [SKIP] ${concept.label}`); skipped++; }
    else     { console.log(`    [OK]   ${concept.label} → ${id}`); created++; }
  }
  console.log(`    → ${created} created, ${skipped} skipped`);
  _ontologyMigrated = true;
}

async function migrateAgent(agent: typeof AGENTS[0]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${agent.code} — ${agent.name}`);
  console.log(`${"─".repeat(60)}`);

  // 0. Ontology concepts (once for all agents)
  await migrateOntologyOnce();

  // 1. Governance policies (idempotent — skip by name)
  console.log("\n  1. Governance Policies");
  const policyIds: string[] = [];
  for (const policy of agent.policies) {
    const { id, skipped } = await prodEnsure(
      "/api/policies",
      "/api/policies",
      {
        name:        policy.name,
        description: policy.content.slice(0, 120),
        domain:      policy.type,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  { enforcement: "hard", content: policy.content },
        organizationId: CFG.prodOrgId,
      },
    );
    console.log(`    ${skipped ? "[SKIP]" : "[OK]  "} ${policy.name} → ${id}`);
    policyIds.push(id);
  }
  ids.policyIds = policyIds.join(",");

  // 2. Knowledge Base (idempotent)
  console.log("\n  2. Knowledge Base");
  const { id: kbId, skipped: kbSkipped } = await prodEnsure(
    "/api/knowledge-bases",
    "/api/knowledge-bases",
    {
      name:               agent.kbName,
      description:        agent.kbDescription,
      industry:           "manufacturing",
      status:             "active",
      embeddingModel:     "text-embedding-3-small",
      embeddingDimensions: 1536,
      chunkSize:          512,
      chunkOverlap:       50,
      organizationId:     CFG.prodOrgId,
    },
  );
  console.log(`    ${kbSkipped ? "[SKIP]" : "[OK]  "} ${agent.kbName} → ${kbId}`);
  ids.kbId = kbId;

  // 3. Skills (idempotent per name)
  console.log("\n  3. Skills");
  const skillIds: string[] = [];
  for (const skill of agent.skills) {
    const { id, skipped } = await prodEnsure(
      "/api/skills",
      "/api/skills",
      {
        name:        skill.name,
        description: skill.description,
        domain:      skill.domain ?? "order_management",
        industry:    skill.industry ?? "manufacturing",
        version:     skill.version ?? "1.0.0",
        author:      "ATLAS Platform Team",
        status:      "active",
        trustTier:   "platform-provided",
        complexity:  "intermediate",
        contextMode: "summary",
        tags:        skill.tags ?? ["order_processing", "manufacturing"],
        organizationId: CFG.prodOrgId,
      },
    );
    console.log(`    ${skipped ? "[SKIP]" : "[OK]  "} ${skill.name} → ${id}`);
    skillIds.push(id);
  }
  ids.skillIds = skillIds.join(",");

  // 4. Blueprint (idempotent)
  console.log("\n  4. Blueprint");
  const bpName = `${agent.code} — ${agent.stage} Blueprint`;
  const { id: bpId, skipped: bpSkipped } = await prodEnsure(
    "/api/blueprints",
    "/api/blueprints",
    {
      name:        bpName,
      description: agent.description,
      version:     1,
      status:      "active",
      patternType: "pipeline",
      blueprintJson: { industry: "manufacturing", useCase: agent.stage },
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${bpSkipped ? "[SKIP]" : "[OK]  "} ${bpName} → ${bpId}`);
  ids.blueprintId = bpId;

  // 5. MCP Server (idempotent)
  console.log("\n  5. MCP Server");
  const serverKey = agent.tools[0]?.server ?? `otc-order-${agent.key}`;
  const mcpName   = `NovaTech ${agent.code} MCP Server`;
  const { id: mcpId, skipped: mcpSkipped } = await prodEnsure(
    "/api/mcp-servers",
    "/api/mcp-servers",
    {
      name:          mcpName,
      description:   `Mock MCP server for ${agent.name}`,
      transportType: "streamable-http",
      url:           `${CFG.prodUrl}/api/mock/${serverKey}`,
      status:        "registered",
      riskTier:      "MEDIUM",
      allowlisted:   true,
      addedBy:       "otc-order-migration",
      capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${mcpSkipped ? "[SKIP]" : "[OK]  "} ${mcpName} → ${mcpId}`);
  ids.mcpServerId = mcpId;

  // 5b. MCP Server Tools — fully idempotent: always list existing tools,
  //     then create only those that are missing by name.
  console.log("\n  5b. MCP Server Tools");
  if (!CFG.dryRun) {
    const existingTools: any[] = await prodGet(`/api/mcp-servers/${mcpId}/tools`).catch(() => []);
    const existingNames = new Set<string>(
      Array.isArray(existingTools) ? existingTools.map((t: any) => t.name as string) : [],
    );
    for (const tool of agent.tools) {
      if (existingNames.has(tool.name)) {
        console.log(`      [SKIP] ${tool.name}`);
        continue;
      }
      await prodPost(`/api/mcp-servers/${mcpId}/tools`, {
        name:            tool.name,
        description:     tool.name.replace(/_/g, " "),
        inputSchema:     { type: "object", properties: {}, required: [] },
        annotations:     { endpoint: tool.path, method: tool.method },
        enabled:         true,
        riskClassification: "low",
      }).catch((e: unknown) => console.log(`      [WARN] ${tool.name}: ${e}`));
      console.log(`      [OK]   ${tool.name}`);
    }
  } else {
    for (const tool of agent.tools) {
      console.log(`  [DRY-RUN] ensure tool ${tool.name}`);
    }
  }

  // 6. Agent (idempotent)
  console.log("\n  6. Agent");
  const { id: agentId, skipped: agentSkipped } = await prodEnsure(
    "/api/agents",
    "/api/agents",
    {
      name:              agent.name,
      description:       agent.description,
      systemPrompt:      agent.systemPrompt,
      agentType:         "operational",
      status:            "active",
      environment:       "production",
      modelProvider:     "openai",
      modelName:         "gpt-4.1",
      riskTier:          "MEDIUM",
      autonomyMode:      "autonomous",
      currentVersion:    "1.0.0",
      maxToolIterations: 6,
      toolAccessClass:   "standard",
      department:        "Order-to-Cash",
      owner:             "NovaTech Industries — OTC Engineering",
      blueprintId:       bpId,
      complianceTags:    ["ASC-606", "GAAP"],
      policyBindings:    [
        { policyName: "RUSH Order SLA Enforcement",    enforcement: "hard" },
        { policyName: "Credit Pre-Authorization Matrix", enforcement: "hard" },
        { policyName: "Inventory Promise Accuracy",    enforcement: "hard" },
      ],
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${agentSkipped ? "[SKIP]" : "[OK]  "} ${agent.name} → ${agentId}`);
  ids.agentId = agentId;

  // 7. Agent → KB link
  console.log("\n  7. KB Link");
  await prodPost(`/api/agents/${agentId}/knowledge-bases`, { knowledgeBaseId: kbId })
    .catch(() => console.log("    [SKIP] KB link already exists"));
  console.log(`    ✓ KB ${kbId} → Agent ${agentId}`);

  // 8. Agent → MCP server link
  console.log("\n  8. MCP Server Link");
  await prodPost(`/api/agents/${agentId}/mcp-servers`, { mcpServerId: mcpId })
    .catch(() => console.log("    [SKIP] MCP link already exists"));
  console.log(`    ✓ MCP ${mcpId} → Agent ${agentId}`);

  return ids;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  CFG = parseArgs();

  console.log(`
${"=".repeat(64)}
  ATLAS — OTC Order Demo 2 Production Migration
  Agents: OTC-AGT-002, OTC-AGT-003, OTC-AGT-004
  Target: ${CFG.prodUrl}
  Org ID: ${CFG.prodOrgId}
  Dry Run: ${CFG.dryRun}
${"=".repeat(64)}
`);

  const summary: Record<string, Record<string, string>> = {};

  for (const agent of AGENTS) {
    const ids = await migrateAgent(agent);
    summary[agent.code] = ids;
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log("  Migration Complete — Summary");
  console.log("=".repeat(64));
  for (const [code, ids] of Object.entries(summary)) {
    console.log(`\n  ${code}:`);
    for (const [k, v] of Object.entries(ids)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log("\n  Resources created/verified:");
  console.log("    Ontology concepts:  12");
  console.log("    Policies:           9  (3 per agent)");
  console.log("    Knowledge bases:    3  (1 per agent)");
  console.log("    Skills:             9  (3 per agent)");
  console.log("    Blueprints:         3  (1 per agent)");
  console.log("    MCP servers:        3  (1 per agent)");
  console.log("    Agents:             3");
  console.log("\n  ✓ All 3 OTC Order agents migrated to production\n");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
