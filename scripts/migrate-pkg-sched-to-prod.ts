#!/usr/bin/env npx tsx
/**
 * migrate-pkg-sched-to-prod.ts
 *
 * Provisions the Advantive SCN-1.1 Predictive Production Scheduling demo against
 * a target ATLAS platform instance via REST API — no direct database access.
 *
 * Usage:
 *   npx tsx scripts/migrate-pkg-sched-to-prod.ts \
 *     --prod-url https://atlas-platform.replit.app \
 *     --prod-org-id cf5754b1-ee80-4b51-8bf6-7be263c97527 \
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
  makePkgSchedMcpServerDefs,
  PKG_SCHED_KB_DEFS,
  PKG_SCHED_SKILLS,
  PKG_SCHED_AGENT_DEFS,
  PKG_SCHED_POLICY_DEFS,
  PKG_SCHED_ONTOLOGY_CONCEPTS,
  PKG_SCHED_SYSTEM_PROMPTS,
  PKG_SCHED_AGENT_POLICIES,
  PKG_AGT_001_NAME, PKG_AGT_002_NAME, PKG_AGT_003_NAME, PKG_AGT_004_NAME,
} from "../server/pkg-sched-shared-defs";

type PolicyDef = { name: string; domain: string; description: string; policyJson: any };
type AgentPolicyEntry = { name: string; content: string; type: string };

// ── CLI argument parsing ───────────────────────────────────────────────────────

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

// ── HTTP helpers ───────────────────────────────────────────────────────────────

interface ApiClient {
  get<T = any>(path: string): Promise<T>;
  post<T = any>(path: string, body: object): Promise<T>;
}

function makeApiClient(baseUrl: string, orgId: string, dryRun: boolean): ApiClient {
  const headers = {
    "Content-Type":    "application/json",
    "x-organization-id": orgId,
  };

  async function request<T>(method: string, path: string, body?: object): Promise<T> {
    const url = `${baseUrl}${path}`;
    if (dryRun && method !== "GET") {
      console.log(`    [dry-run] ${method} ${url}`);
      return {} as T;
    }
    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "(no body)");
      throw new Error(`${method} ${url} → HTTP ${resp.status}: ${text}`);
    }
    const ct = resp.headers.get("content-type") ?? "";
    return ct.includes("application/json") ? (resp.json() as Promise<T>) : ({} as T);
  }

  return {
    get:  <T>(path: string)              => request<T>("GET",  path),
    post: <T>(path: string, body: object) => request<T>("POST", path, body),
  };
}

// ── Blueprint definitions (1 per agent) ──────────────────────────────────────

const PKG_BLUEPRINT_DEFS = [
  {
    externalId:    "PKG-001",
    name:          "PKG — Order Intelligence Blueprint",
    description:   "5-step order analysis pipeline: shift context, RUSH order retrieval, delivery risk scoring, substrate spec validation, and synthesis into the order intelligence brief for Schedule Optimizer.",
    patternType:   "pipeline",
    blueprintJson: {
      industry:      "manufacturing",
      workflowSteps: [
        "Step 1: Get shift context (get_shift_context)",
        "Step 2: Retrieve RUSH orders at risk (get_rush_orders)",
        "Step 3: Score delivery risk across all 47 orders (score_delivery_risk)",
        "Step 4: Validate substrate specifications vs. roll stock (validate_substrate_specs)",
        "Step 5: Synthesise order intelligence brief for PKG-003",
      ],
      requiredTools: ["get_shift_context", "get_rush_orders", "score_delivery_risk", "validate_substrate_specs", "get_order_queue"],
      outputFormat:  "Structured JSON brief passed to next agent in pipeline",
    },
  },
  {
    externalId:    "PKG-002",
    name:          "PKG — Capacity Constraint Mapping Blueprint",
    description:   "6-step capacity mapping pipeline: machine availability check (incl. M3 maintenance), roll stock levels, changeover matrix, composite constraint assembly, and OEE baseline estimation.",
    patternType:   "pipeline",
    blueprintJson: {
      industry:      "manufacturing",
      workflowSteps: [
        "Step 1: Check all 8 machine availability windows (get_machine_availability)",
        "Step 2: Retrieve roll stock levels by substrate type (get_roll_stock_inventory)",
        "Step 3: Retrieve changeover time matrix (get_changeover_matrix)",
        "Step 4: Assemble composite capacity constraints (get_capacity_constraints)",
        "Step 5: Estimate OEE baseline and target (estimate_oee)",
        "Step 6: Assemble constraint map for PKG-003",
      ],
      requiredTools: ["get_machine_availability", "get_roll_stock_inventory", "get_changeover_matrix", "get_capacity_constraints", "estimate_oee"],
      outputFormat:  "Structured JSON brief passed to next agent in pipeline",
    },
  },
  {
    externalId:    "PKG-003",
    name:          "PKG — Schedule Optimization Blueprint",
    description:   "4-step constraint solver pipeline: run constraint solver to generate 3 alternatives, evaluate each alternative, check RUSH coverage, compute Pareto rank, and recommend Alternative A.",
    patternType:   "pipeline",
    blueprintJson: {
      industry:      "manufacturing",
      workflowSteps: [
        "Step 1: Run constraint solver for 3 alternatives (run_constraint_solver)",
        "Step 2: Evaluate each alternative across OEE/OTIF/changeovers (evaluate_alternative)",
        "Step 3: Verify RUSH order coverage in winning alternative (get_rush_coverage)",
        "Step 4: Compute Pareto rank and produce recommendation (compute_pareto_rank)",
      ],
      requiredTools: ["run_constraint_solver", "evaluate_alternative", "get_rush_coverage", "compute_pareto_rank"],
      outputFormat:  "Structured JSON recommendation passed to PKG-004",
    },
  },
  {
    externalId:    "PKG-004",
    name:          "PKG — Schedule Proposal & Approval Blueprint",
    description:   "4-step proposal pipeline: format Gantt proposal, compute KPI projections, publish for plant planner approval, and commit to Kiwiplan ERP on approval.",
    patternType:   "pipeline",
    blueprintJson: {
      industry:      "manufacturing",
      workflowSteps: [
        "Step 1: Format winning schedule as Gantt proposal (format_gantt_proposal)",
        "Step 2: Compute shift-level KPI projections vs. baseline (compute_kpi_projections)",
        "Step 3: Publish proposal for plant planner approval (publish_for_approval)",
        "Step 4: Commit approved schedule to Kiwiplan (commit_to_kiwiplan)",
      ],
      requiredTools: ["format_gantt_proposal", "compute_kpi_projections", "publish_for_approval", "commit_to_kiwiplan"],
      outputFormat:  "Kiwiplan schedule commit confirmation + approval record",
    },
  },
];

// ── Main migration function ────────────────────────────────────────────────────

async function migrate() {
  const { prodUrl, prodOrgId, dryRun } = parseArgs();

  console.log("┌─────────────────────────────────────────────────────────────────────────");
  console.log("│ ATLAS — Advantive SCN-1.1 Production Migration");
  console.log("│ Predictive Production Scheduling & Capacity Optimization");
  console.log("├─────────────────────────────────────────────────────────────────────────");
  console.log(`│ Target URL:    ${prodUrl}`);
  console.log(`│ Target Org ID: ${prodOrgId}`);
  console.log(`│ Dry Run:       ${dryRun}`);
  console.log("└─────────────────────────────────────────────────────────────────────────");

  const api = makeApiClient(prodUrl, prodOrgId, dryRun);
  const PKG_SCHED_MCP_SERVERS = makePkgSchedMcpServerDefs(prodUrl);

  // ── Health check ─────────────────────────────────────────────────────────────
  console.log("\n[1/8] Health check…");
  try {
    await api.get("/api/agents");
    console.log("  ✓ Platform reachable");
  } catch (err: any) {
    console.error(`  ✗ Platform unreachable: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: Ontology Concepts ────────────────────────────────────────────────
  console.log("\n[2/8] Ontology concepts…");
  const existingConcepts: any[] = await api.get("/api/ontology-concepts/all").catch(() => []);
  const conceptIdByLabel: Record<string, string> = {};
  for (const c of PKG_SCHED_ONTOLOGY_CONCEPTS) {
    const existing = existingConcepts.find((x: any) => x.label === c.label);
    if (existing) {
      conceptIdByLabel[c.label] = existing.id;
      console.log(`  skip  ${c.label}`);
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
    }
  }

  // ── Step 3: Policies (6 global + 12 agent-specific = 18 total) ──────────────
  console.log("\n[3/8] Policies (18 total: 6 global + 12 agent-specific)…");
  const existingPolicies: any[] = await api.get("/api/policies").catch(() => []);
  const policyIdByName: Record<string, string> = {};

  // 3a. Global policies (from PKG_SCHED_POLICY_DEFS)
  for (const p of PKG_SCHED_POLICY_DEFS as unknown as PolicyDef[]) {
    const existing = existingPolicies.find((x: any) => x.name === p.name);
    if (existing) {
      policyIdByName[p.name] = existing.id;
      console.log(`  skip  ${p.name}`);
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
    }
  }

  // 3b. Agent-specific policies (3 per agent × 4 agents = 12)
  for (const [, agentPolicies] of Object.entries(PKG_SCHED_AGENT_POLICIES) as [string, AgentPolicyEntry[]][]) {
    for (const ap of agentPolicies) {
      const existing = existingPolicies.find((x: any) => x.name === ap.name);
      if (existing) {
        policyIdByName[ap.name] = existing.id;
        console.log(`  skip  ${ap.name}`);
      } else {
        const created = await api.post("/api/policies", {
          name:        ap.name,
          domain:      "agent_governance",
          description: ap.content,
          status:      "active",
          version:     1,
          scopeType:   "agent",
          policyJson:  {
            enforcement: ["sla", "safety", "governance"].includes(ap.type) ? "hard" : "soft",
            rules:       [{ name: ap.name, description: ap.content }],
          },
        });
        if (!dryRun) policyIdByName[ap.name] = created.id;
        console.log(`  create ${ap.name}`);
      }
    }
  }

  // ── Step 4: Knowledge Bases ───────────────────────────────────────────────────
  console.log("\n[4/8] Knowledge bases…");
  const existingKBs: any[] = await api.get("/api/knowledge-bases").catch(() => []);
  const kbIdByName: Record<string, string> = {};
  for (const kb of PKG_SCHED_KB_DEFS) {
    const existing = existingKBs.find((x: any) => x.name === kb.name);
    if (existing) {
      kbIdByName[kb.name] = existing.id;
      console.log(`  skip  ${kb.name}`);
    } else {
      const created = await api.post("/api/knowledge-bases", {
        name:        kb.name,
        description: kb.description,
        industry:    kb.industry,
        domain:      kb.domain,
        status:      "active",
        embeddingModel: "text-embedding-3-small",
      });
      if (!dryRun) kbIdByName[kb.name] = created.id;
      console.log(`  create ${kb.name}`);
    }
  }

  // ── Step 5: Skills ────────────────────────────────────────────────────────────
  console.log("\n[5/8] Skills…");
  const existingSkills: any[] = await api.get("/api/skills").catch(() => []);
  const skillIdByName: Record<string, string> = {};
  for (const s of PKG_SCHED_SKILLS) {
    const existing = existingSkills.find((x: any) => x.name === s.name);
    if (existing) {
      skillIdByName[s.name] = existing.id;
      console.log(`  skip  ${s.name}`);
    } else {
      const created = await api.post("/api/skills", {
        name:            s.name,
        description:     s.description,
        domain:          s.domain,
        industry:        s.industry,
        version:         s.version,
        author:          s.author,
        trustTier:       "platform-provided",
        complexity:      (s.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            s.tags,
        contextMode:     "summary",
        markdownBody:    s.markdownBody,
        yamlFrontmatter: s.yamlFrontmatter,
      });
      if (!dryRun) skillIdByName[s.name] = created.id;
      console.log(`  create ${s.name}`);
    }
  }

  // ── Step 6: MCP Servers + Tools ──────────────────────────────────────────────
  console.log("\n[6/8] MCP servers + tools…");
  const existingServers: any[] = await api.get("/api/mcp-servers").catch(() => []);
  const mcpServerIdByName: Record<string, string> = {};
  for (const sd of PKG_SCHED_MCP_SERVERS) {
    let server = existingServers.find((x: any) => x.name === sd.name);
    if (!server) {
      server = await api.post("/api/mcp-servers", {
        name:          sd.name,
        description:   sd.description,
        transportType: "streamable-http",
        url:           sd.url,
        status:        "registered",
        riskTier:      "LOW",
        allowlisted:   true,
        addedBy:       "migrate-pkg-sched-to-prod",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "Advantive / Kiwiplan / ATLAS Demo", version: "1.0.0" },
      });
      console.log(`  create MCP server: ${sd.name}`);
    } else {
      console.log(`  skip  MCP server: ${sd.name}`);
    }
    if (!dryRun) mcpServerIdByName[sd.name] = server.id;

    const existingTools: any[] = await api.get(`/api/mcp-servers/${server.id}/tools`).catch(() => []);
    const existingToolNames = new Set(existingTools.map((t: any) => t.name));
    for (const tool of sd.tools) {
      if (existingToolNames.has(tool.name)) {
        console.log(`    skip  tool: ${tool.name}`);
        continue;
      }
      await api.post(`/api/mcp-servers/${server.id}/tools`, {
        serverId:           server.id,
        name:               tool.name,
        description:        tool.description,
        inputSchema:        { type: "object", properties: {}, required: [] },
        annotations:        { endpoint: tool.endpoint, method: tool.method },
        enabled:            true,
        riskClassification: "low",
      });
      console.log(`    create tool: ${tool.name}`);
    }
  }

  // ── Step 7: Blueprints ────────────────────────────────────────────────────────
  console.log("\n[7/8] Blueprints…");
  const existingBlueprints: any[] = await api.get("/api/blueprints").catch(() => []);
  const blueprintIdByExternalId: Record<string, string> = {};
  for (const bp of PKG_BLUEPRINT_DEFS) {
    const existing = existingBlueprints.find((x: any) => x.name === bp.name);
    if (existing) {
      blueprintIdByExternalId[bp.externalId] = existing.id;
      console.log(`  skip  ${bp.name}`);
    } else {
      const created = await api.post("/api/blueprints", {
        name:          bp.name,
        description:   bp.description,
        version:       1,
        status:        "active",
        patternType:   bp.patternType,
        blueprintJson: bp.blueprintJson,
      });
      if (!dryRun) blueprintIdByExternalId[bp.externalId] = created.id;
      console.log(`  create ${bp.name}`);
    }
  }

  // ── Step 8: Agents ────────────────────────────────────────────────────────────
  console.log("\n[8/8] Agents + deployment records…");
  const existingAgents: any[] = await api.get("/api/agents").catch(() => []);
  const agentIdByName: Record<string, string> = {};

  for (const def of PKG_SCHED_AGENT_DEFS) {
    const systemPrompt  = PKG_SCHED_SYSTEM_PROMPTS[def.externalId] || "";
    const agentPolicies = PKG_SCHED_AGENT_POLICIES[def.externalId] || [];
    const blueprintId   = blueprintIdByExternalId[def.externalId];
    const mcpServerId   = mcpServerIdByName[def.mcpServerName];
    const kbId          = kbIdByName[def.kbName];

    const preloadedSkills = def.skillNames
      .map((sn: string) => skillIdByName[sn])
      .filter(Boolean)
      .map((skillId: string) => ({ skillId }));

    const ontologyTags = (def.ontologyTags as string[]).map((label: string) => ({ label }));

    let agent = existingAgents.find((a: any) => a.name === def.name);
    if (!agent) {
      agent = await api.post("/api/agents", {
        name:             def.name,
        description:      def.description,
        status:           "active",
        agentType:        "operational",
        environment:      "production",
        systemPrompt,
        industry:         "manufacturing",
        department:       def.department,
        autonomyMode:     "autonomous",
        maxToolIterations: 6,
        model:            "openai/gpt-4.1",
        modelProvider:    "openai",
        modelName:        "gpt-4.1",
        riskTier:         "MEDIUM",
        currentVersion:   "1.0.0",
        toolAccessClass:  "standard",
        owner:            "Advantive — Westfield Packaging Engineering",
        healthScore:      0.94,
        successRate:      0.94,
        maturityFactors:  {},
        complianceTags:   def.complianceTags,
        ontologyTags,
        policyBindings:   agentPolicies.map((p: any) => ({ name: p.name, type: p.type })),
        preloadedSkills,
        blueprintId,
        evalBindings:     [{ suiteName: "PKG Scheduling Regression Suite", schedule: "weekly" }],
        runtimeConfig:    { prompt: def.name, scheduleIntervalMinutes: 0 },
      });
      console.log(`  create agent: ${def.name}`);
    } else {
      console.log(`  skip  agent: ${def.name}`);
    }
    if (!dryRun) agentIdByName[def.name] = agent.id;

    // ── Link MCP Server ───────────────────────────────────────────────────────
    if (agent.id && mcpServerId) {
      const existingLinks: any[] = await api.get(`/api/agents/${agent.id}/mcp-servers`).catch(() => []);
      const linked = existingLinks.some((l: any) => l.serverId === mcpServerId);
      if (!linked) {
        await api.post(`/api/agents/${agent.id}/mcp-servers`, { agentId: agent.id, serverId: mcpServerId });
        console.log(`    linked MCP: ${def.mcpServerName}`);
      }
    }

    // ── Link Knowledge Base ───────────────────────────────────────────────────
    if (agent.id && kbId) {
      // Response shape: { links: [...], knowledgeBases: [...] }
      const kbLinkResult: any = await api.get(`/api/agents/${agent.id}/knowledge-bases`).catch(() => ({ links: [] }));
      const existingKbLinks: any[] = Array.isArray(kbLinkResult) ? kbLinkResult : (kbLinkResult.links ?? []);
      const kbLinked = existingKbLinks.some((l: any) => l.knowledgeBaseId === kbId);
      if (!kbLinked) {
        await api.post(`/api/agents/${agent.id}/knowledge-bases`, { agentId: agent.id, knowledgeBaseId: kbId });
        console.log(`    linked KB: ${def.kbName}`);
      }
    }

    // ── Deployment record ─────────────────────────────────────────────────────
    if (agent.id) {
      // /api/agents/:id/deployments doesn't exist — use /api/deployments and filter
      const allDeps: any[] = await api.get(`/api/deployments`).catch(() => []);
      const existingDeps = Array.isArray(allDeps) ? allDeps.filter((d: any) => d.agentId === agent.id) : [];
      if (existingDeps.length === 0) {
        await api.post("/api/deployments", {
          agentId:          agent.id,
          agentName:        def.name,
          environment:      "production",
          status:           "pending",
          version:          "1.0.0",
          rolloutStrategy:  "canary",
          canaryPercent:    100,
          pipelineComplete: true,
        });
        console.log(`    created deployment record`);
      } else {
        console.log(`    deployment record exists`);
      }
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────────────
  const totalPolicies  = PKG_SCHED_POLICY_DEFS.length +
    Object.values(PKG_SCHED_AGENT_POLICIES).reduce((n, arr) => n + arr.length, 0);
  const totalSkills    = PKG_SCHED_SKILLS.length;
  const totalConcepts  = PKG_SCHED_ONTOLOGY_CONCEPTS.length;
  const totalKBs       = PKG_SCHED_KB_DEFS.length;
  const totalMcpSvrs   = PKG_SCHED_MCP_SERVERS.length;
  const totalBlueps    = PKG_BLUEPRINT_DEFS.length;
  const totalAgents    = PKG_SCHED_AGENT_DEFS.length;

  const pad = (label: string, n: number, note = ""): string => {
    const l = label.padEnd(24, " ");
    const c = String(n).padStart(4, " ");
    return `│  ${l}${c}  ${note}`;
  };

  console.log("\n┌─────────────────────────────────────────────────────────────────────────");
  console.log(`│  ${dryRun ? "DRY-RUN" : "MIGRATION"} COMPLETE  —  Advantive SCN-1.1 · Westfield Packaging`);
  console.log(`│  Target: ${prodUrl}  (org: ${prodOrgId})`);
  console.log("├──────────────────────────────────────────────────────────────────────────");
  console.log("│  Resource                 Count  Notes");
  console.log("├──────────────────────────────────────────────────────────────────────────");
  console.log(pad("Ontology Concepts",   totalConcepts,  "15 manufacturing domain terms"));
  console.log(pad("Policies",            totalPolicies,  `${PKG_SCHED_POLICY_DEFS.length} global org-scoped + ${totalPolicies - PKG_SCHED_POLICY_DEFS.length} agent-scoped`));
  console.log(pad("Knowledge Bases",     totalKBs,       "Operations / Sustainability / Quality"));
  console.log(pad("Skills",              totalSkills,    "3 per agent (blueprint, MES integration, SLA)"));
  console.log(pad("MCP Servers",         totalMcpSvrs,   "Kiwiplan ESP · Optimizer · Proposal · Commit"));
  console.log(pad("Blueprints",          totalBlueps,    "1 per agent — pipeline pattern"));
  console.log(pad("Agents",              totalAgents,    `${PKG_AGT_001_NAME.slice(0,7)} · ${PKG_AGT_002_NAME.slice(0,7)} · ${PKG_AGT_003_NAME.slice(0,7)} · ${PKG_AGT_004_NAME.slice(0,7)}`));
  console.log(pad("Deployment Records",  totalAgents,    "1 per agent — canary / production"));
  console.log("├──────────────────────────────────────────────────────────────────────────");
  if (dryRun) {
    console.log("│  No changes written — remove --dry-run to apply.");
  } else {
    console.log("│  All resources are idempotent: existing items were skipped, not overwritten.");
    console.log("│  To run the live demo: Demo Center → Predictive Production Scheduling.");
  }
  console.log("└─────────────────────────────────────────────────────────────────────────");
}

migrate().catch(err => {
  console.error("\n[migrate-pkg-sched-to-prod] FATAL:", err.message || err);
  process.exit(1);
});
