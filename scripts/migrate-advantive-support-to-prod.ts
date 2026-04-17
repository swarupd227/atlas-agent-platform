#!/usr/bin/env npx tsx
/**
 * migrate-advantive-support-to-prod.ts
 *
 * Provisions the Advantive ONE AI-First T1 Support Intelligence demo (SCN-ADV-SUP-1.0)
 * against a target platform instance via REST API — no direct database access.
 *
 * Usage:
 *   npx tsx scripts/migrate-advantive-support-to-prod.ts \
 *     --prod-url https://agent-lifecycle-management-platform.replit.app \
 *     --prod-org-id cf5754b1-ee80-4b51-8bf6-7be263c97527 \
 *     [--dry-run]
 *
 * Flags:
 *   --prod-url     Base URL of the target platform (required)
 *   --prod-org-id  Organization ID on the target platform (required)
 *   --dry-run      Validate connectivity and print plan without making changes
 *
 * Idempotent: safe to run multiple times. All resources are looked up by name
 * before creation; existing resources are left unchanged.
 *
 * Provisions:
 *   4 agents    (SUP-001 · SUP-002 · SUP-003 · SUP-004)
 *   4 KBs       (Product KB · Historical Tickets · Error Catalog · T2 Routing)
 *   4 MCP servers + 20 tools
 *   12 skills   (3 per agent)
 *   3 policies
 *   16 ontology concepts
 *   4 blueprints
 *   1 eval suite (10 test cases)
 */

import {
  makeAdvSupportMcpServerDefs,
  ADV_SUPPORT_KB_DEFS,
  ADV_SUPPORT_SKILLS,
  ADV_SUPPORT_AGENT_DEFS,
  ADV_SUPPORT_POLICY_DEFS,
  ADV_SUPPORT_ONTOLOGY_CONCEPTS,
  ADV_SUPPORT_BLUEPRINTS,
  ADV_SUPPORT_SYSTEM_PROMPTS,
} from "../server/advantive-support-shared-defs";

// ── REST resource types ────────────────────────────────────────────────────────

interface ApiResource     { id: string }
interface NamedResource   extends ApiResource { name: string }
interface LabeledResource extends ApiResource { label: string }

// ── CLI argument parsing ────────────────────────────────────────────────────────

function parseArgs(): { prodUrl: string; prodOrgId: string; dryRun: boolean } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const prodUrl   = get("--prod-url");
  const prodOrgId = get("--prod-org-id");
  const dryRun    = args.includes("--dry-run");

  if (!prodUrl) {
    console.error("ERROR: --prod-url is required");
    console.error("Example: --prod-url https://agent-lifecycle-management-platform.replit.app");
    process.exit(1);
  }
  if (!prodOrgId) {
    console.error("ERROR: --prod-org-id is required");
    console.error("Example: --prod-org-id cf5754b1-ee80-4b51-8bf6-7be263c97527");
    process.exit(1);
  }

  return { prodUrl: prodUrl.replace(/\/$/, ""), prodOrgId, dryRun };
}

// ── HTTP client ────────────────────────────────────────────────────────────────

interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: object): Promise<T>;
}

function makeApiClient(baseUrl: string, orgId: string, dryRun: boolean): ApiClient {
  const headers = {
    "Content-Type":      "application/json",
    "x-organization-id": orgId,
  };

  async function request<T>(method: string, path: string, body?: object): Promise<T> {
    const url = `${baseUrl}${path}`;
    if (dryRun && method !== "GET") {
      console.log(`    [dry-run] ${method} ${url}`);
      return {} as T;
    }
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "(no body)");
      throw new Error(`${method} ${url} → HTTP ${resp.status}: ${text}`);
    }
    const ct = resp.headers.get("content-type") ?? "";
    return ct.includes("application/json") ? (resp.json() as Promise<T>) : ({} as T);
  }

  return {
    get:  <T>(path: string)               => request<T>("GET",  path),
    post: <T>(path: string, body: object) => request<T>("POST", path, body),
  };
}

// ── Tool record ────────────────────────────────────────────────────────────────

interface McpToolRecord extends ApiResource { name: string }

// ── Migration counters ─────────────────────────────────────────────────────────

interface Counters {
  kbs:        { created: number; skipped: number };
  mcpServers: { created: number; skipped: number };
  mcpTools:   { created: number; skipped: number };
  skills:     { created: number; skipped: number };
  policies:   { created: number; skipped: number };
  ontology:   { created: number; skipped: number };
  blueprints: { created: number; skipped: number };
  agents:     { created: number; skipped: number };
  evals:      { created: number; skipped: number };
}

function zeroCounts(): Counters {
  return {
    kbs:        { created: 0, skipped: 0 },
    mcpServers: { created: 0, skipped: 0 },
    mcpTools:   { created: 0, skipped: 0 },
    skills:     { created: 0, skipped: 0 },
    policies:   { created: 0, skipped: 0 },
    ontology:   { created: 0, skipped: 0 },
    blueprints: { created: 0, skipped: 0 },
    agents:     { created: 0, skipped: 0 },
    evals:      { created: 0, skipped: 0 },
  };
}

// ── Eval test cases ────────────────────────────────────────────────────────────

const EVAL_SUITE_NAME = "Advantive T1 Support Intelligence — Regression Suite";

const EVAL_CASES = [
  { input: "InfinityQS SPC Pro v9.3 charts not loading after upgrade. SQL timeout IQS-SQL-TMO-7891.",         expected: "Root cause: IQS-BUG-930-0042 migration skip. 5-step resolution path." },
  { input: "How do I configure Xbar-R control limits in InfinityQS v9.2?",                                    expected: "KB resolution with InfinityQS v9.2 control chart documentation cited." },
  { input: "ParityFactory alarm emails stopped working after v9.3 upgrade.",                                   expected: "KB autonomous resolution: SMTP credential vault migration steps." },
  { input: "BioNexus Pharma ParityFactory sync daemon down during FDA audit window.",                          expected: "Regulatory fast-track escalation, legal hold, compliance team CC." },
  { input: "Kiwiplan order scheduling module shows connection error after server restart.",                     expected: "Triage to Diagnostic Agent, error log analysis, escalation if T2 needed." },
  { input: "DDI System barcode printer integration stopped printing after v7.2 patch.",                        expected: "KB search attempt, confidence gate assessment, T2 routing if low confidence." },
  { input: "InfinityQS reporting dashboard shows stale data — last update 4 hours ago.",                      expected: "KB resolution with data refresh and scheduler configuration steps." },
  { input: "Cascade Polymers InfinityQS — IQS-SQL-TMO-7891 on Enterprise tier, ISO audit tomorrow.",          expected: "Full Scenario A pipeline: triage → KB fail → diagnostic → T2 escalation." },
  { input: "How do I add a new user to InfinityQS SPC Pro?",                                                  expected: "High confidence KB resolution (>0.80) — user management guide cited." },
  { input: "ParityFactory v8.2 batch write failures PF-BATCH-WRITE-FAIL-0019 in FDA validation window.",      expected: "Regulatory P0 escalation with compliance protocol, legal hold, Sofia Rodriguez assigned." },
];

// ── Main migration ─────────────────────────────────────────────────────────────

async function migrate() {
  const { prodUrl, prodOrgId, dryRun } = parseArgs();
  const counts = zeroCounts();
  const MCP_SERVERS = makeAdvSupportMcpServerDefs(prodUrl);

  console.log("┌─────────────────────────────────────────────────────────────────────────");
  console.log("│ Advantive ONE — AI-First T1 Support Intelligence Production Migration");
  console.log("│ SCN-ADV-SUP-1.0 · SUP-001 · SUP-002 · SUP-003 · SUP-004");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Target URL:    ${prodUrl}`);
  console.log(`│ Target Org ID: ${prodOrgId}`);
  console.log(`│ Dry Run:       ${dryRun}`);
  console.log("└─────────────────────────────────────────────────────────────────────────");

  const api = makeApiClient(prodUrl, prodOrgId, dryRun);

  // ── Step 1: Health check ─────────────────────────────────────────────────────
  console.log("\n[1/9] Health check…");
  try {
    await api.get("/api/agents");
    console.log("  ✓ Platform reachable");
  } catch (err: unknown) {
    console.error(`  ✗ Platform unreachable: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // ── Step 2: Ontology concepts (16) ──────────────────────────────────────────
  console.log(`\n[2/9] Ontology concepts (${ADV_SUPPORT_ONTOLOGY_CONCEPTS.length})…`);
  const existingConcepts = await api.get<LabeledResource[]>("/api/ontology-concepts/all").catch((): LabeledResource[] => []);
  const conceptIdByName: Record<string, string> = {};
  for (const c of ADV_SUPPORT_ONTOLOGY_CONCEPTS) {
    const existing = existingConcepts.find(x => x.label === c.name);
    if (existing) {
      conceptIdByName[c.name] = existing.id;
      console.log(`  skip   ${c.name}`);
      counts.ontology.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/ontology-concepts", {
        label:       c.name,
        category:    c.domain,
        description: c.description,
        tags:        [c.domain],
        status:      "active",
      });
      if (!dryRun) conceptIdByName[c.name] = created.id;
      console.log(`  create ${c.name}`);
      counts.ontology.created++;
    }
  }

  // ── Step 3: Governance policies (3) ─────────────────────────────────────────
  console.log(`\n[3/9] Governance policies (${ADV_SUPPORT_POLICY_DEFS.length})…`);
  const existingPolicies = await api.get<NamedResource[]>("/api/policies").catch((): NamedResource[] => []);
  const policyIdByName: Record<string, string> = {};
  for (const p of ADV_SUPPORT_POLICY_DEFS) {
    const existing = existingPolicies.find(x => x.name === p.name);
    if (existing) {
      policyIdByName[p.name] = existing.id;
      console.log(`  skip   ${p.name}`);
      counts.policies.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/policies", {
        name:        p.name,
        domain:      p.domain,
        description: p.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  p.policyJson,
      });
      if (!dryRun) policyIdByName[p.name] = created.id;
      console.log(`  create ${p.name}`);
      counts.policies.created++;
    }
  }

  // ── Step 4: Knowledge bases (4) ──────────────────────────────────────────────
  console.log(`\n[4/9] Knowledge bases (${ADV_SUPPORT_KB_DEFS.length})…`);
  const existingKBs = await api.get<NamedResource[]>("/api/knowledge-bases").catch((): NamedResource[] => []);
  const kbIdByName: Record<string, string> = {};
  for (const kb of ADV_SUPPORT_KB_DEFS) {
    const existing = existingKBs.find(x => x.name === kb.name);
    if (existing) {
      kbIdByName[kb.name] = existing.id;
      console.log(`  skip   ${kb.name}`);
      counts.kbs.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/knowledge-bases", {
        name:           kb.name,
        description:    kb.description,
        industry:       "technology_saas",
        domain:         "customer_support_operations",
        status:         "active",
        embeddingModel: "text-embedding-3-small",
      });
      if (!dryRun) kbIdByName[kb.name] = created.id;
      console.log(`  create ${kb.name}`);
      counts.kbs.created++;
    }
  }

  // ── Step 5: MCP servers + tools (4 servers, 20 tools) ───────────────────────
  console.log(`\n[5/9] MCP servers (${MCP_SERVERS.length}) + tools (reconcile all)…`);
  const existingServers = await api.get<NamedResource[]>("/api/mcp-servers").catch((): NamedResource[] => []);
  const serverIdByName: Record<string, string> = {};
  for (const serverDef of MCP_SERVERS) {
    const existing = existingServers.find(x => x.name === serverDef.name);
    let serverId: string | undefined;

    if (existing) {
      serverId = existing.id;
      serverIdByName[serverDef.name] = existing.id;
      console.log(`  skip   ${serverDef.name}`);
      counts.mcpServers.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/mcp-servers", {
        name:        serverDef.name,
        description: serverDef.description,
        url:         serverDef.url,
        status:      "active",
        riskTier:    "low",
        allowlisted: true,
      });
      if (!dryRun) {
        serverId = created.id;
        serverIdByName[serverDef.name] = created.id;
      }
      console.log(`  create ${serverDef.name} → ${serverDef.url}`);
      counts.mcpServers.created++;
    }

    if (!dryRun && serverId) {
      const existingTools = await api
        .get<McpToolRecord[]>(`/api/mcp-servers/${serverId}/tools`)
        .catch((): McpToolRecord[] => []);
      const existingToolNames = new Set(existingTools.map(t => t.name));

      let toolsCreated = 0;
      let toolsSkipped = 0;
      for (const tool of serverDef.tools) {
        if (existingToolNames.has(tool.name)) {
          toolsSkipped++;
          counts.mcpTools.skipped++;
        } else {
          await api.post("/api/mcp-server-tools", {
            serverId,
            name:               tool.name,
            description:        tool.description,
            inputSchema:        { type: "object", properties: {}, required: [] },
            annotations:        { endpoint: tool.endpoint, method: tool.method },
            enabled:            true,
            riskClassification: "low",
          });
          toolsCreated++;
          counts.mcpTools.created++;
        }
      }
      console.log(`    tools: ${toolsCreated} created, ${toolsSkipped} skipped`);
    }
  }

  // ── Step 6: Skills (12 total — 3 per agent) ──────────────────────────────────
  console.log(`\n[6/9] Skills (${ADV_SUPPORT_SKILLS.length})…`);
  const existingSkills = await api.get<NamedResource[]>("/api/skills").catch((): NamedResource[] => []);
  const skillIdByName: Record<string, string> = {};
  for (const s of ADV_SUPPORT_SKILLS) {
    const existing = existingSkills.find(x => x.name === s.name);
    if (existing) {
      skillIdByName[s.name] = existing.id;
      console.log(`  skip   ${s.name}`);
      counts.skills.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/skills", {
        name:            s.name,
        description:     s.description,
        domain:          s.domain,
        industry:        s.industry,
        version:         s.version,
        author:          "Advantive ONE Support Engineering",
        trustTier:       "platform-provided",
        complexity:      "intermediate",
        status:          "active",
        tags:            [...s.tags],
        contextMode:     "summary",
        markdownBody:    `# ${s.name}\n\n${s.description}`,
        yamlFrontmatter: {
          industry:    s.industry,
          domain:      s.domain,
          version:     s.version,
          tags:        [...s.tags],
          contextMode: "summary",
          complexity:  "intermediate",
        },
        allowedTools: [],
      });
      if (!dryRun) skillIdByName[s.name] = created.id;
      console.log(`  create ${s.name}`);
      counts.skills.created++;
    }
  }

  // ── Step 7: Blueprints (4) ───────────────────────────────────────────────────
  console.log(`\n[7/9] Blueprints (${ADV_SUPPORT_BLUEPRINTS.length})…`);
  const existingBlueprints = await api.get<NamedResource[]>("/api/blueprints").catch((): NamedResource[] => []);
  const blueprintIdByName: Record<string, string> = {};
  for (const bp of ADV_SUPPORT_BLUEPRINTS) {
    const existing = existingBlueprints.find(x => x.name === bp.name);
    if (existing) {
      blueprintIdByName[bp.name] = existing.id;
      console.log(`  skip   ${bp.name}`);
      counts.blueprints.skipped++;
    } else {
      const created = await api.post<ApiResource>("/api/blueprints", {
        name:        bp.name,
        description: bp.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:           "technology_saas",
          workflowSteps:      bp.steps.map(s => ({ order: s.order, label: s.label, description: s.description })),
          requiredTools:      bp.steps.map(s => s.label.toLowerCase().replace(/ /g, "_")),
          escalationTriggers: ["KB confidence <0.65", "Enterprise + compliance deadline", "Remote access required"],
          complianceNodes:    ["Confidence-Gate", "Privacy-Policy", "Audit-Trail"],
          outputFormat:       "JSON pipeline summary + Salesforce case + T2 routing",
        },
      });
      if (!dryRun) blueprintIdByName[bp.name] = created.id;
      console.log(`  create ${bp.name}`);
      counts.blueprints.created++;
    }
  }

  // Blueprint name → agent key mapping
  const BLUEPRINT_NAME_TO_AGENT_KEY: Record<string, string> = {
    "Advantive Support — Triage & Routing Blueprint":       "triage",
    "Advantive Support — Knowledge Resolution Blueprint":    "knowledge",
    "Advantive Support — Diagnostic Reasoning Blueprint":    "diagnostic",
    "Advantive Support — Escalation Packaging Blueprint":    "escalation",
  };

  // ── Step 8: Agents (4) ──────────────────────────────────────────────────────
  console.log(`\n[8/9] Agents (${ADV_SUPPORT_AGENT_DEFS.length})…`);
  const existingAgents = await api.get<NamedResource[]>("/api/agents").catch((): NamedResource[] => []);
  const agentIdByKey: Record<string, string> = {};
  for (const def of ADV_SUPPORT_AGENT_DEFS) {
    const existing = existingAgents.find(x => x.name === def.name);
    if (existing) {
      agentIdByKey[def.key] = existing.id;
      console.log(`  skip   ${def.name} (${def.externalId})`);
      counts.agents.skipped++;
      if (!dryRun) {
        await api.post(`/api/agents/${existing.id}/eval-bindings`, {
          suiteName: EVAL_SUITE_NAME,
          schedule:  "weekly",
        }).catch(() => {});
      }
    } else {
      const mcpServerId  = serverIdByName[def.mcpServerName];
      const mcpServerIds = mcpServerId ? [mcpServerId] : [];
      const skillIds     = def.skillNames
        .map(n => skillIdByName[n])
        .filter(Boolean)
        .map(skillId => ({ skillId }));
      const ontologyTags = def.ontologyTags.map(label => ({ label }));
      const kbId         = kbIdByName[def.kbName];
      const blueprintName = Object.keys(BLUEPRINT_NAME_TO_AGENT_KEY).find(
        n => BLUEPRINT_NAME_TO_AGENT_KEY[n] === def.key,
      );
      const blueprintId = blueprintName ? blueprintIdByName[blueprintName] : undefined;
      const systemPrompt = ADV_SUPPORT_SYSTEM_PROMPTS[def.externalId] ?? def.description;

      const created = await api.post<ApiResource>("/api/agents", {
        name:              def.name,
        description:       def.description,
        systemPrompt,
        runtimeConfig:     { prompt: def.description, scheduleIntervalMinutes: 0 },
        agentType:         "operational",
        status:            "active",
        environment:       "production",
        modelProvider:     def.modelProvider,
        modelName:         def.modelName,
        riskTier:          "MEDIUM",
        autonomyMode:      "autonomous",
        currentVersion:    "1.0.0",
        maxToolIterations: 10,
        toolAccessClass:   "standard",
        department:        def.department,
        owner:             "Advantive ONE Support Engineering",
        healthScore:       0.97,
        successRate:       0.97,
        preloadedSkills:   skillIds,
        blueprintId,
        complianceTags:    [...def.complianceTags],
        ontologyTags,
        mcpServerIds,
        knowledgeBaseId:   kbId,
        evalBindings:      [{ suiteName: EVAL_SUITE_NAME, schedule: "weekly" }],
      });
      if (!dryRun) agentIdByKey[def.key] = created.id;
      console.log(`  create ${def.name} (${def.externalId})`);
      counts.agents.created++;
    }
  }

  // ── Step 9: Eval suite + 10 test cases ───────────────────────────────────────
  console.log(`\n[9/9] Eval suite + cases (${EVAL_CASES.length})…`);
  const existingEvals = await api.get<NamedResource[]>("/api/eval-suites").catch((): NamedResource[] => []);
  const existingSuite = existingEvals.find(x => x.name === EVAL_SUITE_NAME);
  const leadAgentId   = agentIdByKey["triage"];

  if (existingSuite) {
    console.log(`  skip   ${EVAL_SUITE_NAME}`);
    counts.evals.skipped++;
  } else if (!dryRun && leadAgentId) {
    try {
      const suite = await api.post<ApiResource>("/api/eval-suites", {
        agentId:     leadAgentId,
        name:        EVAL_SUITE_NAME,
        type:        "regression",
        industry:    "technology_saas",
        passRate:    0.95,
        totalCases:  EVAL_CASES.length,
        description: "End-to-end regression suite for the 4-agent T1 support pipeline across Scenarios A, B, and C.",
      });
      console.log(`  create ${EVAL_SUITE_NAME}`);
      counts.evals.created++;

      for (const [i, tc] of EVAL_CASES.entries()) {
        await api.post("/api/eval-cases", {
          suiteId:          suite.id,
          agentId:          leadAgentId,
          input:            tc.input,
          expectedOutput:   tc.expected,
          evaluationMethod: "semantic_similarity",
          weight:           1,
          tags:             ["t1-support", "advantive"],
        });
        console.log(`  case   ${i + 1}/${EVAL_CASES.length}: ${tc.input.slice(0, 60)}…`);
      }
    } catch (err: unknown) {
      console.warn(`  ⚠ Eval suite creation failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (dryRun) {
    console.log(`  [dry-run] would create ${EVAL_SUITE_NAME} (${EVAL_CASES.length} cases)`);
  } else {
    console.log(`  skip   eval suite (no lead agent ID yet)`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────────");
  console.log("│ Migration complete");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Ontology concepts: ${counts.ontology.created} created, ${counts.ontology.skipped} skipped`);
  console.log(`│ Policies:          ${counts.policies.created} created, ${counts.policies.skipped} skipped`);
  console.log(`│ Knowledge Bases:   ${counts.kbs.created} created, ${counts.kbs.skipped} skipped`);
  console.log(`│ MCP Servers:       ${counts.mcpServers.created} created, ${counts.mcpServers.skipped} skipped`);
  console.log(`│ MCP Tools:         ${counts.mcpTools.created} created, ${counts.mcpTools.skipped} skipped`);
  console.log(`│ Skills:            ${counts.skills.created} created, ${counts.skills.skipped} skipped`);
  console.log(`│ Blueprints:        ${counts.blueprints.created} created, ${counts.blueprints.skipped} skipped`);
  console.log(`│ Agents:            ${counts.agents.created} created, ${counts.agents.skipped} skipped`);
  console.log(`│ Eval suite:        ${counts.evals.created} created, ${counts.evals.skipped} skipped`);
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log("│ Agent Registry:");
  console.log("│   SUP-001 · Triage & Intent Classifier       [gpt-4.1]");
  console.log("│   SUP-002 · Knowledge Resolution Agent       [gpt-4.1]");
  console.log("│   SUP-003 · Diagnostic Reasoning Agent       [gpt-4.1]");
  console.log("│   SUP-004 · T1→T2 Escalation Packager        [gpt-4.1]");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log("│ Demo Route:  /demo/advantive-support");
  console.log("│ SSE Demo:    GET /demo-api/advantive-support/live-run?scenario=A|B|C");
  console.log("└─────────────────────────────────────────────────────────────────────────");
}

migrate().catch(err => {
  console.error("\n✗ Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
