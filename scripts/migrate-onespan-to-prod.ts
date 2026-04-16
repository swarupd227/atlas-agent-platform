#!/usr/bin/env npx tsx
/**
 * migrate-onespan-to-prod.ts
 *
 * Provisions the OneSpan Digital Agreements Intelligence demo (SCN-OS-1.0)
 * against a target ATLAS platform instance via REST API — no direct database access.
 *
 * Usage:
 *   npx tsx scripts/migrate-onespan-to-prod.ts \
 *     --prod-url https://atlas-platform.replit.app \
 *     --prod-org-id <target-org-id> \
 *     [--dry-run]
 *
 * Flags:
 *   --prod-url     Base URL of the target ATLAS platform (required)
 *   --prod-org-id  Organization ID on the target platform (required)
 *   --dry-run      Validate connectivity and print plan without making changes
 *
 * The script is fully idempotent — re-running it is safe. All resources are
 * looked up by name before creation; existing resources are left unchanged.
 *
 * NEVER run db:push — it drops the pgvector embedding column.
 */

import {
  makeOnespanMcpServerDefs,
  ONESPAN_KB_DEFS,
  ONESPAN_SKILLS,
  ONESPAN_AGENT_DEFS,
  ONESPAN_POLICY_DEFS,
  ONESPAN_ONTOLOGY_CONCEPTS,
  ONESPAN_BLUEPRINT_DEFS,
  ONESPAN_EVAL_CASES,
  ONESPAN_AGENT_POLICIES,
  AGR_001_NAME,
  OS_TARGET_TXN_ID,
  OS_TARGET_CLIENT,
} from "../server/onespan-shared-defs";

// ── REST resource types (minimal shapes returned by the ATLAS API) ─────────────

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
    console.error("Example: --prod-url https://atlas-platform.replit.app");
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

// ── Tool record returned by the ATLAS MCP tools API ────────────────────────────

interface McpToolRecord extends ApiResource { name: string }

// ── Migration counters ─────────────────────────────────────────────────────────

interface Counters {
  kbs: { created: number; skipped: number };
  mcpServers: { created: number; skipped: number };
  mcpTools: { created: number; skipped: number };
  skills: { created: number; skipped: number };
  policies: { created: number; skipped: number };
  ontology: { created: number; skipped: number };
  blueprints: { created: number; skipped: number };
  agents: { created: number; skipped: number };
  policyLinks: { created: number; skipped: number };
  evals: { created: number; skipped: number };
}

function zeroCounts(): Counters {
  return {
    kbs:         { created: 0, skipped: 0 },
    mcpServers:  { created: 0, skipped: 0 },
    mcpTools:    { created: 0, skipped: 0 },
    skills:      { created: 0, skipped: 0 },
    policies:    { created: 0, skipped: 0 },
    ontology:    { created: 0, skipped: 0 },
    blueprints:  { created: 0, skipped: 0 },
    agents:      { created: 0, skipped: 0 },
    policyLinks: { created: 0, skipped: 0 },
    evals:       { created: 0, skipped: 0 },
  };
}

// ── Main migration function ────────────────────────────────────────────────────

async function migrate() {
  const { prodUrl, prodOrgId, dryRun } = parseArgs();
  const counts = zeroCounts();

  console.log("┌─────────────────────────────────────────────────────────────────────────");
  console.log("│ ATLAS — OneSpan SCN-OS-1.0 Production Migration");
  console.log("│ Digital Agreements Intelligence — VIP Decline Recovery Pipeline");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Target URL:    ${prodUrl}`);
  console.log(`│ Target Org ID: ${prodOrgId}`);
  console.log(`│ Dry Run:       ${dryRun}`);
  console.log("└─────────────────────────────────────────────────────────────────────────");

  const api = makeApiClient(prodUrl, prodOrgId, dryRun);
  const MCP_SERVERS = makeOnespanMcpServerDefs(prodUrl);

  // ── Step 1: Health check ─────────────────────────────────────────────────────
  console.log("\n[1/9] Health check…");
  try {
    await api.get("/api/agents");
    console.log("  ✓ Platform reachable");
  } catch (err: unknown) {
    console.error(`  ✗ Platform unreachable: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  // ── Step 2: Ontology concepts ────────────────────────────────────────────────
  console.log("\n[2/9] Ontology concepts (12)…");
  const existingConcepts = await api.get<LabeledResource[]>("/api/ontology-concepts/all").catch((): LabeledResource[] => []);
  const conceptIdByLabel: Record<string, string> = {};
  for (const c of ONESPAN_ONTOLOGY_CONCEPTS) {
    const existing = existingConcepts.find(x => x.label === c.label);
    if (existing) {
      conceptIdByLabel[c.label] = existing.id;
      console.log(`  skip   ${c.label}`);
      counts.ontology.skipped++;
    } else {
      const created = await api.post("/api/ontology-concepts", {
        label:       c.label,
        category:    c.category,
        description: c.description,
        tags:        c.tags,
        status:      "active",
      });
      if (!dryRun) conceptIdByLabel[c.label] = created.id;
      console.log(`  create ${c.label}`);
      counts.ontology.created++;
    }
  }

  // ── Step 3: Policies ─────────────────────────────────────────────────────────
  console.log("\n[3/9] Policies (3)…");
  const existingPolicies = await api.get<NamedResource[]>("/api/policies").catch((): NamedResource[] => []);
  const policyIdByName: Record<string, string> = {};
  for (const p of ONESPAN_POLICY_DEFS) {
    const existing = existingPolicies.find(x => x.name === p.name);
    if (existing) {
      policyIdByName[p.name] = existing.id;
      console.log(`  skip   ${p.name}`);
      counts.policies.skipped++;
    } else {
      const created = await api.post("/api/policies", {
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

  // ── Step 4: Knowledge bases ──────────────────────────────────────────────────
  console.log("\n[4/9] Knowledge bases (3)…");
  const existingKBs = await api.get<NamedResource[]>("/api/knowledge-bases").catch((): NamedResource[] => []);
  const kbIdByName: Record<string, string> = {};
  for (const kb of ONESPAN_KB_DEFS) {
    const existing = existingKBs.find(x => x.name === kb.name);
    if (existing) {
      kbIdByName[kb.name] = existing.id;
      console.log(`  skip   ${kb.name}`);
      counts.kbs.skipped++;
    } else {
      const created = await api.post("/api/knowledge-bases", {
        name:           kb.name,
        description:    kb.description,
        industry:       kb.industry,
        domain:         kb.domain,
        status:         "active",
        embeddingModel: "text-embedding-3-small",
      });
      if (!dryRun) kbIdByName[kb.name] = created.id;
      console.log(`  create ${kb.name}`);
      counts.kbs.created++;
    }
  }

  // ── Step 5: MCP servers + tools (reconcile both new and existing) ────────────
  console.log("\n[5/9] MCP servers (5) + tools (reconcile all)…");
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

    // Reconcile tools for ALL servers (new or existing) — idempotent on name
    if (!dryRun && serverId) {
      const existingTools = await api
        .get<McpToolRecord[]>(`/api/mcp-servers/${serverId}/tools`)
        .catch((): McpToolRecord[] => []);
      const existingToolNames = new Set(existingTools.map(t => t.name));

      for (const tool of serverDef.tools) {
        if (existingToolNames.has(tool.name)) {
          counts.mcpTools.skipped++;
        } else {
          await api.post("/api/mcp-server-tools", {
            serverId,
            name:               tool.name,
            description:        tool.description,
            inputSchema:        tool.inputSchema,
            annotations:        { endpoint: tool.endpoint, method: tool.method },
            enabled:            true,
            riskClassification: "low",
          });
          counts.mcpTools.created++;
        }
      }
      if (counts.mcpTools.created > 0 || counts.mcpTools.skipped > 0) {
        console.log(`    tools: ${counts.mcpTools.created} created, ${counts.mcpTools.skipped} skipped`);
      }
    }
  }

  // ── Step 6: Skills ───────────────────────────────────────────────────────────
  console.log("\n[6/9] Skills (12)…");
  const existingSkills = await api.get<NamedResource[]>("/api/skills").catch((): NamedResource[] => []);
  const skillIdByName: Record<string, string> = {};
  for (const s of ONESPAN_SKILLS) {
    const existing = existingSkills.find(x => x.name === s.name);
    if (existing) {
      skillIdByName[s.name] = existing.id;
      console.log(`  skip   ${s.name}`);
      counts.skills.skipped++;
    } else {
      const created = await api.post("/api/skills", {
        name:            s.name,
        description:     s.description,
        domain:          s.domain,
        industry:        s.industry,
        version:         s.version,
        author:          "OneSpan Digital Agreements Analytics Engineering",
        trustTier:       "platform-provided",
        complexity:      (s.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            s.tags,
        contextMode:     (s.yamlFrontmatter.contextMode as string) || "summary",
        markdownBody:    s.markdownBody,
        yamlFrontmatter: {
          ...s.yamlFrontmatter,
          industry: "financial_services",
          domain:   "digital_agreements",
          version:  "1.0",
          tags:     s.tags,
        },
        allowedTools: [...(s.yamlFrontmatter.allowedTools || [])],
      });
      if (!dryRun) skillIdByName[s.name] = created.id;
      console.log(`  create ${s.name}`);
      counts.skills.created++;
    }
  }

  // ── Step 7: Blueprints ───────────────────────────────────────────────────────
  console.log("\n[7/9] Blueprints (4) + agents…");
  const existingBlueprints = await api.get<NamedResource[]>("/api/blueprints").catch((): NamedResource[] => []);
  const blueprintIdByKey: Record<string, string> = {};
  for (const bp of ONESPAN_BLUEPRINT_DEFS) {
    const existing = existingBlueprints.find(x => x.name === bp.name);
    if (existing) {
      blueprintIdByKey[bp.key] = existing.id;
      console.log(`  skip   ${bp.name}`);
      counts.blueprints.skipped++;
    } else {
      const created = await api.post("/api/blueprints", {
        name:        bp.name,
        description: bp.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:           "financial_services",
          workflowSteps:      bp.workflowSteps,
          requiredTools:      bp.requiredTools,
          escalationTriggers: ["VIP decline", "Document version mismatch", "AML attestation gap"],
          complianceNodes:    ["Document-Version-Currency", "VIP-SLA", "Agent-Intervention-Audit", "Human-in-Loop-Gate"],
          outputFormat:       "Portfolio Ops Intelligence Report + JSON pipeline summary",
        },
      });
      if (!dryRun) blueprintIdByKey[bp.key] = created.id;
      console.log(`  create ${bp.name}`);
      counts.blueprints.created++;
    }
  }

  // ── Step 7b: Agents ──────────────────────────────────────────────────────────
  const AGENT_POLICY_BINDINGS = [...ONESPAN_AGENT_POLICIES];
  const EVAL_SUITE_NAME = "OneSpan — Digital Agreements Intelligence Regression Suite";
  const AGENT_ONTOLOGY_TAGS: Record<string, string[]> = {
    transactionHealthMonitor:  ["Digital Agreement Envelope", "Completion Rate", "Agreement Stall", "VIP Transaction"],
    exceptionClassifier:       ["Document Version Mismatch", "AML Attestation Clause", "Signer Session Event", "Corrective Resend"],
    interventionOrchestrator:  ["Corrective Resend", "Relationship Manager", "Envelope Audit Trail"],
    agreementOpsIntelligence:  ["Peer Benchmark", "OneSpan Analytics Dashboard", "Envelope Audit Trail"],
  };

  const existingAgents = await api.get<NamedResource[]>("/api/agents").catch((): NamedResource[] => []);
  const agentIdByKey: Record<string, string> = {};
  for (const def of ONESPAN_AGENT_DEFS) {
    const existing = existingAgents.find(x => x.name === def.name);
    if (existing) {
      agentIdByKey[def.key] = existing.id;
      console.log(`  skip   ${def.name}`);
      counts.agents.skipped++;
      // Reconcile eval binding for existing agent — idempotent PATCH
      if (!dryRun) {
        await api.post(`/api/agents/${existing.id}/eval-bindings`, {
          suiteName: EVAL_SUITE_NAME,
          schedule:  "weekly",
        }).catch(() => { /* already bound or unsupported — continue */ });
      }
    } else {
      const mcpServerIds = def.mcpServerNames
        .map(n => serverIdByName[n])
        .filter(Boolean);
      const skillIds = def.skillNames
        .map(n => skillIdByName[n])
        .filter(Boolean)
        .map(skillId => ({ skillId }));
      const ontologyTags = (AGENT_ONTOLOGY_TAGS[def.key] || []).map(label => ({ label }));
      const blueprintId  = blueprintIdByKey[def.key];
      const kbId         = kbIdByName[def.kbName];

      const created = await api.post<ApiResource>("/api/agents", {
        name:              def.name,
        description:       def.description,
        systemPrompt:      def.systemPrompt,
        runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        agentType:         "operational",
        status:            "active",
        environment:       "production",
        modelProvider:     "openai",
        modelName:         "gpt-4.1",
        riskTier:          "MEDIUM",
        autonomyMode:      "autonomous",
        currentVersion:    "1.0.0",
        maxToolIterations: def.maxToolIterations,
        toolAccessClass:   "standard",
        department:        "Digital Agreements Operations",
        owner:             "OneSpan Digital Agreements Engineering",
        healthScore:       0.96,
        successRate:       0.96,
        preloadedSkills:   skillIds,
        blueprintId,
        complianceTags:    ["AML-2026Q1", "ONESPAN-POLICY-V3.2", "VIP-SLA"],
        policyBindings:    AGENT_POLICY_BINDINGS,
        ontologyTags,
        mcpServerIds,
        knowledgeBaseId:   kbId,
        evalBindings:      [{ suiteName: EVAL_SUITE_NAME, schedule: "weekly" }],
      });
      if (!dryRun) agentIdByKey[def.key] = created.id;
      console.log(`  create ${def.name}`);
      counts.agents.created++;
    }
  }

  // ── Step 8: Explicit agent-policy link reconciliation ─────────────────────────
  // Runs for ALL agents (new or skipped) — ensures 3 policy bindings per agent
  // regardless of whether the agent was provisioned in this run or previously.
  console.log("\n[8/9] Agent-policy link reconciliation (3 policies × 4 agents)…");
  for (const def of ONESPAN_AGENT_DEFS) {
    const agentId = agentIdByKey[def.key];
    if (!agentId || dryRun) {
      if (dryRun) console.log(`  [dry-run] would reconcile policies for ${def.name}`);
      continue;
    }
    const existingBindings = await api
      .get<Array<{ policyName?: string; policy?: { name: string } }>>(`/api/agents/${agentId}/policies`)
      .catch(() => []);
    const boundPolicyNames = new Set(
      existingBindings.map(b => b.policyName ?? b.policy?.name ?? ""),
    );
    for (const binding of ONESPAN_AGENT_POLICIES) {
      if (boundPolicyNames.has(binding.policyName)) {
        console.log(`  skip   ${def.name} ← ${binding.policyName}`);
        counts.policyLinks.skipped++;
      } else {
        const policyId = policyIdByName[binding.policyName];
        if (policyId) {
          await api.post(`/api/agents/${agentId}/policies`, {
            policyId,
            policyName:  binding.policyName,
            enforcement: binding.enforcement,
          });
          console.log(`  link   ${def.name} ← ${binding.policyName}`);
          counts.policyLinks.created++;
        }
      }
    }
  }

  // ── Step 9: Eval suite + cases ───────────────────────────────────────────────
  console.log("\n[9/9] Eval suite + cases (10)…");
  const existingEvals = await api.get<NamedResource[]>("/api/eval-suites").catch((): NamedResource[] => []);
  const existingSuite = existingEvals.find(x => x.name === EVAL_SUITE_NAME);
  const leadAgentId   = agentIdByKey["transactionHealthMonitor"];

  if (existingSuite) {
    console.log(`  skip   ${EVAL_SUITE_NAME}`);
    counts.evals.skipped++;
  } else if (!dryRun && leadAgentId) {
    const suite = await api.post("/api/eval-suites", {
      agentId:         leadAgentId,
      name:            EVAL_SUITE_NAME,
      type:            "regression",
      industry:        "financial_services",
      passRate:        0.94,
      totalCases:      10,
      coverageTags:    ["portfolio_health","vip_sla","exception_classification","aml_compliance","intervention","crm_audit","rm_escalation","benchmarks"],
      thresholdConfig: { minPassRate: 0.90 },
      scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
    });
    console.log(`  create ${EVAL_SUITE_NAME}`);
    counts.evals.created++;

    for (const ec of ONESPAN_EVAL_CASES) {
      await api.post(`/api/eval-suites/${suite.id}/test-cases`, {
        name:           ec.name,
        severity:       ec.severity,
        tags:           ec.tags,
        status:         "active",
        origin:         "onespan_spec",
        weight:         ec.severity === "critical" ? 2 : 1,
        inputData:      { scenario: ec.name },
        expectedOutput: { pass: true },
      });
    }
    console.log(`    + ${ONESPAN_EVAL_CASES.length} test cases created`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────────");
  console.log("│ MIGRATION COMPLETE — 9 steps");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Scenario: ${OS_TARGET_TXN_ID} — ${OS_TARGET_CLIENT} VIP Decline Recovery`);
  console.log(`│ Agents provisioned: ${AGR_001_NAME}, AGR-002, AGR-003, AGR-004`);
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Ontology concepts : ${counts.ontology.created} created, ${counts.ontology.skipped} skipped`);
  console.log(`│ Policies (3 org)  : ${counts.policies.created} created, ${counts.policies.skipped} skipped`);
  console.log(`│ Knowledge bases   : ${counts.kbs.created} created, ${counts.kbs.skipped} skipped`);
  console.log(`│ MCP servers       : ${counts.mcpServers.created} created, ${counts.mcpServers.skipped} skipped`);
  console.log(`│ MCP tools (recon) : ${counts.mcpTools.created} created, ${counts.mcpTools.skipped} skipped`);
  console.log(`│ Skills            : ${counts.skills.created} created, ${counts.skills.skipped} skipped`);
  console.log(`│ Blueprints        : ${counts.blueprints.created} created, ${counts.blueprints.skipped} skipped`);
  console.log(`│ Agents            : ${counts.agents.created} created, ${counts.agents.skipped} skipped`);
  console.log(`│ Policy links (12) : ${counts.policyLinks.created} linked, ${counts.policyLinks.skipped} already bound`);
  console.log(`│ Eval suites       : ${counts.evals.created} created, ${counts.evals.skipped} skipped`);
  if (dryRun) {
    console.log("│");
    console.log("│ [DRY RUN] No changes were made. Remove --dry-run to apply.");
  }
  console.log("└─────────────────────────────────────────────────────────────────────────");
}

migrate().catch(err => {
  console.error("[migrate-onespan] Fatal error:", err?.message ?? err);
  process.exit(1);
});
