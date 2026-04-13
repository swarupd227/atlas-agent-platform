#!/usr/bin/env npx ts-node
/**
 * SCN-1.1 Fitch RW Demo — Dev → Production Migration Script
 *
 * Migrates all Fitch Rating Watch Intelligence Pipeline resources from Dev to
 * Production using only platform REST API calls (no direct DB access to Prod).
 *
 * Usage:
 *   npx ts-node scripts/migrate-fitch-rw-to-prod.ts \
 *     --prod-url  https://your-prod-app.replit.app \
 *     --prod-org-id cf5754b1-ee80-4b51-8bf6-7be263c97527 \
 *     --prod-api-key sk-... \
 *     [--dev-url http://localhost:5000] \
 *     [--dry-run]
 *
 * Resources migrated (in dependency order):
 *   1.  Ontology concepts (12)
 *   2.  Governance policies (4)
 *   3.  Knowledge bases (4)
 *   4.  Skills (12, 3 per agent)
 *   5.  Blueprints (4, one per agent)
 *   6.  MCP servers + tools (4 servers, 4 tools each)
 *   7.  Agents (4, FITCH-RW-001 through FITCH-RW-004) ← agents before eval suite
 *   8.  Shared eval suite + test cases (agentId resolved from prod)
 *   9.  Agent → KB links
 *   10. Agent → MCP server links
 */

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): {
  prodUrl: string;
  prodOrgId: string;
  prodApiKey: string;
  devUrl: string;
  dryRun: boolean;
} {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };
  const prodUrl    = get("--prod-url")     ?? process.env.PROD_URL    ?? "";
  const prodOrgId  = get("--prod-org-id")  ?? process.env.PROD_ORG_ID ?? "";
  const prodApiKey = get("--prod-api-key") ?? process.env.PROD_API_KEY ?? "";
  const devUrl     = get("--dev-url")      ?? process.env.DEV_URL     ?? "http://localhost:5000";
  const dryRun     = argv.includes("--dry-run");

  if (!prodUrl)   { console.error("ERROR: --prod-url is required"); process.exit(1); }
  if (!prodOrgId) { console.error("ERROR: --prod-org-id is required"); process.exit(1); }

  return {
    prodUrl: prodUrl.replace(/\/$/, ""),
    prodOrgId,
    prodApiKey,
    devUrl: devUrl.replace(/\/$/, ""),
    dryRun,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

let CFG: ReturnType<typeof parseArgs>;

async function devGet<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`${CFG.devUrl}${path}`);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`DEV GET ${path} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

async function prodGet<T = unknown>(path: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CFG.prodApiKey) headers["Authorization"] = `Bearer ${CFG.prodApiKey}`;
  const r = await fetch(`${CFG.prodUrl}${path}`, { headers });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`PROD GET ${path} → HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json() as Promise<T>;
}

async function _prodWrite<T = unknown>(
  method: "POST" | "PUT" | "PATCH",
  path: string,
  body: unknown,
): Promise<T> {
  if (CFG.dryRun) {
    log(`[DRY-RUN] ${method} ${path}`);
    return { id: `dry-run-${Math.random().toString(36).slice(2, 9)}` } as T;
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (CFG.prodApiKey) headers["Authorization"] = `Bearer ${CFG.prodApiKey}`;
  const r = await fetch(`${CFG.prodUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: T;
  try { data = JSON.parse(text) as T; } catch { data = text as unknown as T; }
  if (!r.ok) throw new Error(`PROD ${method} ${path} → HTTP ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

const prodPost  = <T = unknown>(path: string, body: unknown) => _prodWrite<T>("POST",  path, body);
const prodPut   = <T = unknown>(path: string, body: unknown) => _prodWrite<T>("PUT",   path, body);
const prodPatch = <T = unknown>(path: string, body: unknown) => _prodWrite<T>("PATCH", path, body);

// ─── Logging ──────────────────────────────────────────────────────────────────

const log  = (msg: string) => process.stdout.write(`  [OK]   ${msg}\n`);
const skip = (msg: string) => process.stdout.write(`  [SKIP] ${msg}\n`);
const warn = (msg: string) => process.stdout.write(`  [WARN] ${msg}\n`);
const step = (n: number, total: number, msg: string) =>
  process.stdout.write(`\nSTEP ${n}/${total}  ${msg}\n${"─".repeat(60)}\n`);

// ─── Strip server-generated fields + inject prod org ID ───────────────────────
// NOTE: Do NOT use forProd() for ontology concepts — their id must be preserved.

function forProd(obj: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const {
    id, createdAt, updatedAt, lastEvalAt, lastEvalPassRate, activationCount,
    performanceScore, totalRuns, monthlyCost, monthlyRevenue, triggerCount,
    ...rest
  } = obj;
  void id; // intentionally stripped for most resources
  return { ...rest, organizationId: CFG.prodOrgId, ...overrides };
}

// ─── Summary counters ─────────────────────────────────────────────────────────

const summary = {
  agents:     { created: 0, skipped: 0 },
  kbs:        { created: 0, skipped: 0 },
  skills:     { created: 0, skipped: 0 },
  policies:   { created: 0, skipped: 0 },
  ontology:   { created: 0, skipped: 0 },
  blueprints: { created: 0, skipped: 0 },
  mcpServers: { created: 0, skipped: 0 },
  evals:      { created: 0, skipped: 0 },
  kbLinks:    { created: 0, skipped: 0 },
  mcpLinks:   { created: 0, skipped: 0 },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  CFG = parseArgs();
  const TOTAL_STEPS = 10;

  console.log("\n" + "═".repeat(70));
  console.log("  ATLAS — SCN-1.1 Fitch RW Demo · Dev → Production Migration");
  console.log(`  Dev:  ${CFG.devUrl}`);
  console.log(`  Prod: ${CFG.prodUrl}  (org: ${CFG.prodOrgId})`);
  if (CFG.dryRun) console.log("  MODE: DRY-RUN — no writes will be made to Production");
  console.log("═".repeat(70));

  // ── Read Dev state ──────────────────────────────────────────────────────────

  console.log("\nFetching Fitch RW resources from Dev…");

  const [
    devAgentsList,
    devKbList,
    devPolicyList,
    devSkillList,
    devBlueprintList,
    devMcpServerList,
    devEvalList,
    devOntologyList,
  ] = await Promise.all([
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/agents"),
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/knowledge-bases"),
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/policies"),
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/skills"),
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/blueprints"),
    devGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/mcp-servers"),
    devGet<{ id: string; name: string; agentId: string; [k: string]: unknown }[]>("/api/evals"),
    // industryId (not industry) is required by GET /api/ontology/concepts
    devGet<{ id: string; label: string; [k: string]: unknown }[]>(
      "/api/ontology/concepts?industryId=financial_services"
    ),
  ]);

  // ── Filter to Fitch RW resources ────────────────────────────────────────────
  //
  // Agents are matched by the "FITCH-RW-" name prefix, which acts as the logical
  // external identifier for this pipeline (the agents schema has no externalId column;
  // the task spec's "externalId prefix FITCH-RW-" maps to the agent name convention).
  const FITCH_RW_NAME_PREFIX = "FITCH-RW-";

  const FITCH_AGENT_NAMES = [
    "FITCH-RW-001 Market Signal Scanner",
    "FITCH-RW-002 Filing Intelligence Agent",
    "FITCH-RW-003 Peer Benchmarking Agent",
    "FITCH-RW-004 Rating Action Memo Agent",
  ];
  const FITCH_KB_NAMES = [
    "Rating Methodology Library",
    "SEC Filing Archive",
    "Peer Cohort Definitions",
    "Historical Rating Actions DB",
  ];
  const FITCH_POLICY_NAMES = [
    "MNPI Containment",
    "Human-in-Loop Gate",
    "Data Residency",
    "Audit Trail",
  ];
  const FITCH_SKILL_NAMES = [
    "Financial Time Series Analysis", "Threshold Breach Detection", "CDS Spread Monitoring",
    "SEC Filing Comprehension", "Covenant Extraction", "Liquidity Analysis",
    "Peer Group Analysis", "Financial Ratio Benchmarking", "Outlier Detection",
    "Fitch Methodology Application", "Structured Report Generation", "Evidence Citation",
  ];
  const FITCH_BLUEPRINT_NAMES = [
    "Fitch RW — Market Signal Scanner Blueprint",
    "Fitch RW — Filing Intelligence Agent Blueprint",
    "Fitch RW — Peer Benchmarking Agent Blueprint",
    "Fitch RW — Rating Action Memo Agent Blueprint",
  ];
  const FITCH_MCP_NAMES = [
    "Fitch RW — Bloomberg Terminal",
    "Fitch RW — SEC EDGAR Intelligence",
    "Fitch RW — Peer Analytics Engine",
    "Fitch RW — Committee Approval Gateway",
  ];
  const FITCH_ONTOLOGY_LABELS = [
    "Credit Default Swap Spread", "Rating Watch Negative", "EBIT Interest Coverage",
    "Net Debt to EBITDA", "Free Cash Flow to Debt", "Going Concern Opinion",
    "Peer Cohort", "SEC Rule 17g-7", "EU CRA III Article 11",
    "MD&A Tone", "Bloomberg Terminal Feed", "Rating Committee",
  ];
  const FITCH_EVAL_SUITE_NAME = "Fitch RW — Rating Watch Intelligence Regression Suite";

  // Primary filter: exact FITCH_AGENT_NAMES; fallback scan by name prefix
  const devAgents = devAgentsList.filter(a =>
    FITCH_AGENT_NAMES.includes(a.name) || a.name.startsWith(FITCH_RW_NAME_PREFIX)
  );
  const devKbs        = devKbList.filter(k   => FITCH_KB_NAMES.includes(k.name));
  const devPolicies   = devPolicyList.filter(p => FITCH_POLICY_NAMES.includes(p.name));
  const devSkills     = devSkillList.filter(s  => FITCH_SKILL_NAMES.includes(s.name));
  const devBlueprints = devBlueprintList.filter(b => FITCH_BLUEPRINT_NAMES.includes(b.name));
  const devMcpServers = devMcpServerList.filter(m => FITCH_MCP_NAMES.includes(m.name));
  const devOntology   = devOntologyList.filter(o => FITCH_ONTOLOGY_LABELS.includes(o.label));
  const devEvalSuite  = devEvalList.find(e => e.name === FITCH_EVAL_SUITE_NAME);

  console.log(`  Found: ${devAgents.length} agents, ${devKbs.length} KBs, ${devPolicies.length} policies`);
  console.log(`         ${devSkills.length} skills, ${devBlueprints.length} blueprints, ${devMcpServers.length} MCP servers`);
  console.log(`         ${devOntology.length} ontology concepts, eval suite: ${devEvalSuite ? "✓" : "✗"}`);

  if (devAgents.length < 4) {
    warn(
      `Only ${devAgents.length}/4 Fitch RW agents found in Dev (expected names starting with "${FITCH_RW_NAME_PREFIX}"). ` +
      `Run GET ${CFG.devUrl}/demo-api/fitch-rw/setup first to provision agents.`
    );
  }
  if (devAgents.length === 0) {
    warn("No Fitch RW agents found — aborting migration. Setup the demo environment first.");
    process.exit(1);
  }

  // ── Fetch current Prod state (idempotency) ──────────────────────────────────

  console.log("\nFetching current Production state for idempotency checks…");
  const [
    prodAgentsList,
    prodKbList,
    prodPolicyList,
    prodSkillList,
    prodBlueprintList,
    prodMcpServerList,
    prodEvalList,
    prodOntologyList,
  ] = await Promise.all([
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/agents")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/knowledge-bases")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/policies")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/skills")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/blueprints")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; [k: string]: unknown }[]>("/api/mcp-servers")
      .catch((): { id: string; name: string }[] => []),
    prodGet<{ id: string; name: string; agentId: string; [k: string]: unknown }[]>("/api/evals")
      .catch((): { id: string; name: string; agentId: string }[] => []),
    prodGet<{ id: string; label: string; [k: string]: unknown }[]>(
      "/api/ontology/concepts?industryId=financial_services"
    ).catch((): { id: string; label: string }[] => []),
  ]);

  // Prod ID maps (name/label → prod ID)
  const prodKbIdByName:        Record<string, string> = {};
  const prodPolicyIdByName:    Record<string, string> = {};
  const prodSkillIdByName:     Record<string, string> = {};
  const prodBlueprintIdByName: Record<string, string> = {};
  const prodMcpIdByName:       Record<string, string> = {};
  const prodAgentIdByName:     Record<string, string> = {};
  const prodOntologyIdByLabel: Record<string, string> = {};

  prodKbList.forEach(k      => { prodKbIdByName[k.name]           = k.id; });
  prodPolicyList.forEach(p  => { prodPolicyIdByName[p.name]       = p.id; });
  prodSkillList.forEach(s   => { prodSkillIdByName[s.name]        = s.id; });
  prodBlueprintList.forEach(b => { prodBlueprintIdByName[b.name]  = b.id; });
  prodMcpServerList.forEach(m => { prodMcpIdByName[m.name]        = m.id; });
  prodAgentsList.forEach(a  => { prodAgentIdByName[a.name]        = a.id; });
  prodOntologyList.forEach(o => { prodOntologyIdByLabel[o.label]  = o.id; });

  let prodEvalSuiteId = prodEvalList.find(e => e.name === FITCH_EVAL_SUITE_NAME)?.id;

  // Dev name → ID reverse maps (for resolving links during agent creation)
  const devKbIdToName:        Record<string, string> = {};
  const devMcpIdToName:       Record<string, string> = {};
  const devBlueprintIdToName: Record<string, string> = {};
  const devSkillIdToName:     Record<string, string> = {};
  devKbs.forEach(k        => { devKbIdToName[k.id]        = k.name; });
  devMcpServers.forEach(m => { devMcpIdToName[m.id]       = m.name; });
  devBlueprints.forEach(b => { devBlueprintIdToName[b.id] = b.name; });
  devSkills.forEach(s     => { devSkillIdToName[s.id]     = s.name; });

  // ── STEP 1: Ontology Concepts ───────────────────────────────────────────────
  //
  // IMPORTANT: POST /api/ontology/concepts requires both `id` (the UUID) AND `industryId`
  // as required fields. We therefore preserve the dev `id` and explicitly set `industryId`.
  // forProd() is NOT used here.

  step(1, TOTAL_STEPS, "Ontology concepts");
  for (const concept of devOntology) {
    if (prodOntologyIdByLabel[concept.label]) {
      skip(`Ontology concept already exists: ${concept.label}`);
      summary.ontology.skipped++;
    } else {
      const { createdAt, updatedAt, industry, status, ...rest } = concept as Record<string, unknown>;
      void createdAt; void updatedAt; void status;
      // Preserve `id` — required by the endpoint schema
      const ontologyPayload: Record<string, unknown> = {
        ...rest,
        industryId: (industry as string | undefined) ?? "financial_services",
        source: (concept as Record<string, unknown>).source ?? "custom-extension",
        properties: (concept as Record<string, unknown>).properties ?? [],
        relationships: (concept as Record<string, unknown>).relationships ?? [],
        synonyms: (concept as Record<string, unknown>).synonyms ?? [],
        tags: (concept as Record<string, unknown>).tags ?? [],
      };
      const created = await prodPost<{ id: string }>("/api/ontology/concepts", ontologyPayload);
      prodOntologyIdByLabel[concept.label] = created.id;
      log(`Created ontology concept: ${concept.label}`);
      summary.ontology.created++;
    }
  }

  // ── STEP 2: Policies ────────────────────────────────────────────────────────

  step(2, TOTAL_STEPS, "Governance policies");
  for (const policy of devPolicies) {
    if (prodPolicyIdByName[policy.name]) {
      skip(`Policy already exists: ${policy.name}`);
      summary.policies.skipped++;
    } else {
      const created = await prodPost<{ id: string }>(
        "/api/policies",
        forProd(policy as Record<string, unknown>, { scopeId: null })
      );
      prodPolicyIdByName[policy.name] = created.id;
      log(`Created policy: ${policy.name}`);
      summary.policies.created++;
    }
  }

  // ── STEP 3: Knowledge Bases ─────────────────────────────────────────────────

  step(3, TOTAL_STEPS, "Knowledge bases");
  for (const kb of devKbs) {
    if (prodKbIdByName[kb.name]) {
      skip(`KB already exists: ${kb.name}`);
      summary.kbs.skipped++;
    } else {
      const created = await prodPost<{ id: string }>(
        "/api/knowledge-bases",
        forProd(kb as Record<string, unknown>)
      );
      prodKbIdByName[kb.name] = created.id;
      log(`Created KB: ${kb.name}`);
      summary.kbs.created++;
    }
  }

  // ── STEP 4: Skills ──────────────────────────────────────────────────────────

  step(4, TOTAL_STEPS, "Agent skills (12 total, 3 per agent)");
  for (const skill of devSkills) {
    if (prodSkillIdByName[skill.name]) {
      skip(`Skill already exists: ${skill.name}`);
      summary.skills.skipped++;
    } else {
      const created = await prodPost<{ id: string }>(
        "/api/skills",
        forProd(skill as Record<string, unknown>)
      );
      prodSkillIdByName[skill.name] = created.id;
      log(`Created skill: ${skill.name}`);
      summary.skills.created++;
    }
  }

  // ── STEP 5: Blueprints ──────────────────────────────────────────────────────

  step(5, TOTAL_STEPS, "Agent blueprints (one per agent)");
  for (const bp of devBlueprints) {
    if (prodBlueprintIdByName[bp.name]) {
      skip(`Blueprint already exists: ${bp.name}`);
      summary.blueprints.skipped++;
    } else {
      const created = await prodPost<{ id: string }>(
        "/api/blueprints",
        forProd(bp as Record<string, unknown>)
      );
      prodBlueprintIdByName[bp.name] = created.id;
      log(`Created blueprint: ${bp.name}`);
      summary.blueprints.created++;
    }
  }

  // ── STEP 6: MCP Servers + Tools ─────────────────────────────────────────────

  step(6, TOTAL_STEPS, "MCP servers and tools");
  for (const server of devMcpServers) {
    let serverId = prodMcpIdByName[server.name];
    if (serverId) {
      skip(`MCP server already exists: ${server.name}`);
      summary.mcpServers.skipped++;
    } else {
      const created = await prodPost<{ id: string }>(
        "/api/mcp-servers",
        forProd(server as Record<string, unknown>)
      );
      serverId = created.id;
      prodMcpIdByName[server.name] = serverId;
      log(`Created MCP server: ${server.name} → ${serverId}`);
      summary.mcpServers.created++;
    }

    // Migrate tools for this server
    let devTools: { id: string; name: string; [k: string]: unknown }[] = [];
    try {
      devTools = await devGet<{ id: string; name: string; [k: string]: unknown }[]>(
        `/api/mcp-servers/${server.id}/tools`
      );
    } catch (e) {
      warn(`Could not fetch tools for MCP server "${server.name}": ${(e as Error).message}`);
    }

    let prodTools: { id: string; name: string }[] = [];
    try {
      prodTools = await prodGet<{ id: string; name: string }[]>(`/api/mcp-servers/${serverId}/tools`);
    } catch { /* new server */ }
    const prodToolNames = new Set(prodTools.map(t => t.name));

    let toolsCreated = 0;
    for (const tool of devTools) {
      if (prodToolNames.has(tool.name as string)) continue;
      const toolPayload = forProd(tool as Record<string, unknown>, { serverId });
      await prodPost(`/api/mcp-servers/${serverId}/tools`, toolPayload);
      toolsCreated++;
    }
    if (toolsCreated > 0) log(`  └─ Created ${toolsCreated} tool(s) for: ${server.name}`);
  }

  // ── STEP 7: Agents ──────────────────────────────────────────────────────────
  //
  // Agents are created BEFORE the eval suite so that a valid agentId is available
  // when creating the eval suite in Step 8.

  step(7, TOTAL_STEPS, `Fitch RW agents (${devAgents.length} found via "${FITCH_RW_NAME_PREFIX}" prefix)`);

  // Fetch per-agent linkage details from Dev in parallel
  interface AgentFull {
    agent: { id: string; name: string; [k: string]: unknown };
    kbLinks:  { knowledgeBaseId: string; [k: string]: unknown }[];
    mcpLinks: { serverId: string; [k: string]: unknown }[];
  }

  const agentDetails: AgentFull[] = await Promise.all(
    devAgents.map(async (agent) => {
      // GET /api/agents/:agentId/knowledge-bases returns { links, knowledgeBases }
      const [kbResp, mcpLinks] = await Promise.all([
        devGet<{ links: { knowledgeBaseId: string; [k: string]: unknown }[] }>(
          `/api/agents/${agent.id}/knowledge-bases`
        ).catch(() => ({ links: [] as { knowledgeBaseId: string }[] })),
        devGet<{ serverId: string; [k: string]: unknown }[]>(
          `/api/agents/${agent.id}/mcp-servers`
        ).catch(() => [] as { serverId: string }[]),
      ]);
      const kbLinks = Array.isArray(kbResp) ? kbResp : (kbResp?.links ?? []);
      return { agent, kbLinks, mcpLinks };
    })
  );

  for (const { agent } of agentDetails) {
    if (prodAgentIdByName[agent.name]) {
      skip(`Agent already exists: ${agent.name}`);
      summary.agents.skipped++;
      continue;
    }

    // Resolve prod IDs for preloadedSkills (stored as [{ skillId }] JSONB)
    const devPreloadedSkills = (agent.preloadedSkills as { skillId: string }[] | undefined) ?? [];
    const prodPreloadedSkills = devPreloadedSkills
      .map(({ skillId }) => {
        const skillName = devSkillIdToName[skillId];
        const prodId    = skillName ? prodSkillIdByName[skillName] : undefined;
        return prodId ? { skillId: prodId } : null;
      })
      .filter(Boolean) as { skillId: string }[];

    // Resolve prod blueprint ID
    const devBpId  = agent.blueprintId as string | undefined;
    const bpName   = devBpId ? devBlueprintIdToName[devBpId] : undefined;
    const prodBpId = bpName  ? prodBlueprintIdByName[bpName]  : undefined;

    // policyBindings, ontologyTags, evalBindings are stored by name/label/suiteName (not IDs)
    const policyBindings = agent.policyBindings ?? [];
    const ontologyTags   = agent.ontologyTags   ?? [];
    const evalBindings   = agent.evalBindings   ?? [];

    const agentPayload = forProd(agent as Record<string, unknown>, {
      blueprintId:     prodBpId ?? null,
      preloadedSkills: prodPreloadedSkills,
      policyBindings,
      ontologyTags,
      evalBindings,
      lastRunId:       null,
    });

    const created = await prodPost<{ id: string }>("/api/agents", agentPayload);
    prodAgentIdByName[agent.name] = created.id;
    log(`Created agent: ${agent.name} → ${created.id}`);
    summary.agents.created++;
  }

  // ── STEP 8: Eval Suite + Test Cases ─────────────────────────────────────────
  //
  // Created AFTER agents so agentId for the suite can be resolved from prod.
  // Uses PUT /api/evals/:id for updates (PATCH is not exposed on this resource).

  step(8, TOTAL_STEPS, "Shared eval suite + test cases");
  if (!devEvalSuite) {
    warn(`Eval suite "${FITCH_EVAL_SUITE_NAME}" not found in Dev — skipping. Run setup first.`);
  } else {
    // Resolve lead agent (FITCH-RW-001) on prod now that agents have been created
    const prodLeadAgentId = prodAgentIdByName["FITCH-RW-001 Market Signal Scanner"];

    if (prodEvalSuiteId) {
      skip(`Eval suite already exists: ${FITCH_EVAL_SUITE_NAME}`);
      summary.evals.skipped++;

      // If the suite exists but has no agentId (e.g. was migrated without one), patch it
      if (prodLeadAgentId) {
        await prodPut(`/api/evals/${prodEvalSuiteId}`, { agentId: prodLeadAgentId }).catch(() =>
          warn("Could not update eval suite agentId — may need manual correction")
        );
      }
    } else {
      if (!prodLeadAgentId) {
        warn(
          `Cannot create eval suite: prod agent "FITCH-RW-001 Market Signal Scanner" not found. ` +
          `Ensure agent creation succeeded in Step 7.`
        );
      } else {
        const evalPayload = forProd(devEvalSuite as unknown as Record<string, unknown>, {
          agentId: prodLeadAgentId,
        });
        const created = await prodPost<{ id: string }>("/api/evals", evalPayload);
        prodEvalSuiteId = created.id;
        log(`Created eval suite: ${FITCH_EVAL_SUITE_NAME} → ${prodEvalSuiteId}`);
        summary.evals.created++;
      }
    }

    // Migrate test cases if we have a suite ID
    if (prodEvalSuiteId) {
      let devCases: { id: string; name: string; [k: string]: unknown }[] = [];
      try {
        devCases = await devGet<{ id: string; name: string; [k: string]: unknown }[]>(
          `/api/evals/${devEvalSuite.id}/test-cases`
        );
      } catch (e) {
        warn(`Could not fetch eval test cases from Dev: ${(e as Error).message}`);
      }

      let prodCases: { id: string; name: string }[] = [];
      try {
        prodCases = await prodGet<{ id: string; name: string }[]>(
          `/api/evals/${prodEvalSuiteId}/test-cases`
        );
      } catch { /* new suite */ }
      const prodCaseNames = new Set(prodCases.map(c => c.name));

      let casesCreated = 0;
      for (const tc of devCases) {
        if (prodCaseNames.has(tc.name as string)) continue;
        const casePayload = forProd(tc as Record<string, unknown>, { suiteId: prodEvalSuiteId });
        await prodPost(`/api/evals/${prodEvalSuiteId}/test-cases`, casePayload);
        casesCreated++;
      }
      if (casesCreated > 0) log(`  └─ Created ${casesCreated} test case(s)`);
      else if (devCases.length > 0) skip(`All ${devCases.length} test cases already exist`);
    }
  }

  // ── STEP 9: Agent → KB Links ────────────────────────────────────────────────

  step(9, TOTAL_STEPS, "Agent → Knowledge Base links");

  for (const { agent, kbLinks } of agentDetails) {
    const prodAgentId = prodAgentIdByName[agent.name];
    if (!prodAgentId) {
      warn(`No prod agent ID for "${agent.name}" — skipping KB links`);
      continue;
    }

    // GET /api/agents/:agentId/knowledge-bases returns { links, knowledgeBases }
    let existingProdKbLinks: { knowledgeBaseId: string }[] = [];
    try {
      const kbResp = await prodGet<
        { links: { knowledgeBaseId: string }[] } | { knowledgeBaseId: string }[]
      >(`/api/agents/${prodAgentId}/knowledge-bases`);
      existingProdKbLinks = Array.isArray(kbResp) ? kbResp : (kbResp?.links ?? []);
    } catch { /* new agent, no links yet */ }
    const alreadyLinkedKbIds = new Set(existingProdKbLinks.map(l => l.knowledgeBaseId));

    for (const link of kbLinks) {
      const kbName   = devKbIdToName[link.knowledgeBaseId];
      const prodKbId = kbName ? prodKbIdByName[kbName] : undefined;
      if (!prodKbId) { warn(`KB "${kbName ?? link.knowledgeBaseId}" not found on Prod — skipping link`); continue; }
      if (alreadyLinkedKbIds.has(prodKbId)) {
        skip(`KB "${kbName}" already linked to ${agent.name}`);
        summary.kbLinks.skipped++;
        continue;
      }
      await prodPost(`/api/agents/${prodAgentId}/knowledge-bases`, { knowledgeBaseId: prodKbId });
      log(`Linked KB "${kbName}" → ${agent.name}`);
      summary.kbLinks.created++;
    }
  }

  // ── STEP 10: Agent → MCP Server Links ───────────────────────────────────────

  step(10, TOTAL_STEPS, "Agent → MCP Server links");

  for (const { agent, mcpLinks } of agentDetails) {
    const prodAgentId = prodAgentIdByName[agent.name];
    if (!prodAgentId) {
      warn(`No prod agent ID for "${agent.name}" — skipping MCP links`);
      continue;
    }

    let existingProdMcpLinks: { serverId: string }[] = [];
    try {
      existingProdMcpLinks = await prodGet<{ serverId: string }[]>(
        `/api/agents/${prodAgentId}/mcp-servers`
      );
    } catch { /* new agent */ }
    const alreadyLinkedMcpIds = new Set(existingProdMcpLinks.map(l => l.serverId));

    for (const link of mcpLinks) {
      const mcpName   = devMcpIdToName[link.serverId];
      const prodMcpId = mcpName ? prodMcpIdByName[mcpName] : undefined;
      if (!prodMcpId) {
        warn(`MCP server "${mcpName ?? link.serverId}" not found on Prod — skipping link`);
        continue;
      }
      if (alreadyLinkedMcpIds.has(prodMcpId)) {
        skip(`MCP server "${mcpName}" already linked to ${agent.name}`);
        summary.mcpLinks.skipped++;
        continue;
      }
      try {
        await prodPost(`/api/agents/${prodAgentId}/mcp-servers`, {
          serverId:            prodMcpId,
          acknowledgeWarnings: true,
        });
        log(`Linked MCP "${mcpName}" → ${agent.name}`);
        summary.mcpLinks.created++;
      } catch (e) {
        warn(`MCP link "${mcpName}" → ${agent.name} failed: ${(e as Error).message}`);
      }
    }
  }

  // ── Summary table ────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(70));
  console.log("  MIGRATION COMPLETE" + (CFG.dryRun ? " (DRY-RUN — no writes made)" : ""));
  console.log("═".repeat(70));
  const row = (label: string, c: { created: number; skipped: number }) =>
    `  ${label.padEnd(22)} created: ${String(c.created).padStart(3)}   skipped: ${String(c.skipped).padStart(3)}`;
  console.log(row("Agents",            summary.agents));
  console.log(row("Knowledge Bases",   summary.kbs));
  console.log(row("Policies",          summary.policies));
  console.log(row("Skills",            summary.skills));
  console.log(row("Blueprints",        summary.blueprints));
  console.log(row("MCP Servers",       summary.mcpServers));
  console.log(row("Eval Suites",       summary.evals));
  console.log(row("Ontology Concepts", summary.ontology));
  console.log(row("KB Links",          summary.kbLinks));
  console.log(row("MCP Links",         summary.mcpLinks));
  console.log("─".repeat(70));
  const totalCreated = Object.values(summary).reduce((s, c) => s + c.created, 0);
  const totalSkipped = Object.values(summary).reduce((s, c) => s + c.skipped, 0);
  console.log(`  TOTAL                  created: ${String(totalCreated).padStart(3)}   skipped: ${String(totalSkipped).padStart(3)}`);
  console.log("═".repeat(70) + "\n");

  if (!CFG.dryRun && totalCreated > 0) {
    console.log("  Next step: verify the Production demo at:");
    console.log(`  ${CFG.prodUrl}/demo/fitch-rw\n`);
  }
}

main().catch((err: Error) => {
  console.error("\n[FATAL]", err.message);
  process.exit(1);
});
