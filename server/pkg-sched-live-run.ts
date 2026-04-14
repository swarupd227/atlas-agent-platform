import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, runtimeEvents } from "./agent-runtime";
import {
  PKG_AGT_001_NAME, PKG_AGT_002_NAME, PKG_AGT_003_NAME, PKG_AGT_004_NAME,
  makePkgSchedMcpServerDefs,
  PKG_SCHED_KB_DEFS,
  PKG_SCHED_SKILLS,
  PKG_SCHED_AGENT_DEFS,
  PKG_SCHED_POLICY_DEFS,
  PKG_SCHED_ONTOLOGY_CONCEPTS,
  PKG_SCHED_SYSTEM_PROMPTS,
  PKG_SCHED_AGENT_POLICIES,
} from "./pkg-sched-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const PKG_SCHED_MCP_SERVERS = makePkgSchedMcpServerDefs(BASE_URL);

let _pkgSchedSetupDone = false;
const _pkgAgentIdByName: Record<string, string> = {};
const _pkgMcpServerIdByName: Record<string, string> = {};
const _pkgDeploymentIdByName: Record<string, string> = {};

async function _refreshPkgMcpServerIds(): Promise<void> {
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of PKG_SCHED_MCP_SERVERS) {
    const server = allServers.find(s => s.name === serverDef.name);
    if (server) _pkgMcpServerIdByName[serverDef.name] = server.id;
  }
}

export async function ensurePackagingSchedAgents(): Promise<void> {
  if (_pkgSchedSetupDone) {
    await _refreshPkgMcpServerIds();
    const allAgents = await storage.getAgents().catch(() => [] as any[]);
    for (const def of PKG_SCHED_AGENT_DEFS) {
      const agent = allAgents.find((a: any) => a.name === def.name);
      if (agent) _pkgAgentIdByName[def.name] = (agent as any).id;
    }
    return;
  }

  // ── 1. Ontology Concepts ────────────────────────────────────────────────────
  const { randomUUID } = await import("crypto");
  const allConcepts = await storage.getOntologyConcepts("manufacturing").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingConceptLabels = new Set(allConcepts.map(c => c.label));
  for (const c of PKG_SCHED_ONTOLOGY_CONCEPTS) {
    if (!existingConceptLabels.has(c.label)) {
      await storage.createOntologyConcept({
        id:            randomUUID(),
        industryId:    "manufacturing",
        ontologyName:  "Westfield Packaging SCN-1.1",
        label:         c.label,
        category:      c.category,
        description:   c.description,
        tags:          c.tags,
        properties:    [],
        relationships: [],
        synonyms:      [],
        source:        "industry-standard",
      });
    }
  }

  // ── 2. Knowledge Bases ──────────────────────────────────────────────────────
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of PKG_SCHED_KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:                kbDef.name,
        description:         kbDef.description,
        industry:            "manufacturing",
        status:              "active",
        embeddingModel:      "text-embedding-3-small",
        embeddingDimensions: 1536,
        chunkSize:           512,
        chunkOverlap:        50,
      });
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // ── 3. Governance Policies ──────────────────────────────────────────────────
  const policyIdByName: Record<string, string> = {};
  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const pDef of PKG_SCHED_POLICY_DEFS) {
    let policy = allPolicies.find(p => p.name === pDef.name);
    if (!policy) {
      policy = await storage.createPolicy({
        name:        pDef.name,
        domain:      pDef.domain,
        description: pDef.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  pDef.policyJson,
      });
    }
    policyIdByName[pDef.name] = policy.id;
  }

  // ── 4. Skills ───────────────────────────────────────────────────────────────
  const skillIdByName: Record<string, string> = {};
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of PKG_SCHED_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:            skillDef.name,
        description:     skillDef.description,
        domain:          skillDef.domain,
        industry:        skillDef.industry,
        version:         skillDef.version,
        author:          skillDef.author,
        trustTier:       "platform-provided",
        complexity:      (skillDef.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            skillDef.tags as unknown as string[],
        contextMode:     "summary",
        markdownBody:    skillDef.markdownBody,
        yamlFrontmatter: { ...skillDef.yamlFrontmatter },
      });
    }
    skillIdByName[skillDef.name] = skill.id;
  }

  // ── 5. MCP Servers + Tools ──────────────────────────────────────────────────
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of PKG_SCHED_MCP_SERVERS) {
    let server = allServers.find(s => s.name === serverDef.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:          serverDef.name,
        description:   serverDef.description,
        transportType: "streamable-http",
        url:           serverDef.url,
        status:        "registered",
        riskTier:      "LOW",
        allowlisted:   true,
        addedBy:       "pkg-sched-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "Advantive / Kiwiplan / ATLAS Demo", version: "1.0.0" },
      });
    } else if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
    _pkgMcpServerIdByName[serverDef.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    for (const tool of serverDef.tools) {
      if (existingToolNames.has(tool.name)) continue;
      await storage.createMcpServerTool({
        serverId:           server.id,
        name:               tool.name,
        description:        tool.description,
        inputSchema:        { type: "object", properties: {}, required: [] },
        annotations:        { endpoint: tool.endpoint, method: tool.method },
        enabled:            true,
        riskClassification: "low",
      });
    }
  }

  // ── 6. Blueprints ───────────────────────────────────────────────────────────
  const PKG_BLUEPRINT_DEFS = [
    {
      externalId:    "PKG-001",
      name:          "PKG — Order Intelligence Blueprint",
      description:   "5-step order analysis pipeline: shift context, RUSH order retrieval, delivery risk scoring, substrate spec validation, and synthesis into the order intelligence brief for Schedule Optimizer.",
      workflowSteps: [
        "Step 1: Get shift context (get_shift_context)",
        "Step 2: Retrieve RUSH orders at risk (get_rush_orders)",
        "Step 3: Score delivery risk across all 47 orders (score_delivery_risk)",
        "Step 4: Validate substrate specifications vs. roll stock (validate_substrate_specs)",
        "Step 5: Synthesise order intelligence brief for PKG-003",
      ],
      requiredTools: ["get_shift_context", "get_rush_orders", "score_delivery_risk", "validate_substrate_specs", "get_order_queue"],
    },
    {
      externalId:    "PKG-002",
      name:          "PKG — Capacity Constraint Mapping Blueprint",
      description:   "6-step capacity mapping pipeline: machine availability check (incl. M3 maintenance), roll stock levels, changeover matrix, composite constraint assembly, and OEE baseline estimation.",
      workflowSteps: [
        "Step 1: Check all 8 machine availability windows (get_machine_availability)",
        "Step 2: Retrieve roll stock levels by substrate type (get_roll_stock_inventory)",
        "Step 3: Retrieve changeover time matrix (get_changeover_matrix)",
        "Step 4: Assemble composite capacity constraints (get_capacity_constraints)",
        "Step 5: Estimate OEE baseline and target (estimate_oee)",
        "Step 6: Assemble constraint map for PKG-003",
      ],
      requiredTools: ["get_machine_availability", "get_roll_stock_inventory", "get_changeover_matrix", "get_capacity_constraints", "estimate_oee"],
    },
    {
      externalId:    "PKG-003",
      name:          "PKG — Schedule Optimization Blueprint",
      description:   "4-step constraint solver pipeline: run constraint solver to generate 3 alternatives, evaluate each alternative, check RUSH coverage, compute Pareto rank, and recommend Alternative A.",
      workflowSteps: [
        "Step 1: Run constraint solver for 3 alternatives (run_constraint_solver)",
        "Step 2: Evaluate each alternative across OEE/OTIF/changeovers (evaluate_alternative)",
        "Step 3: Verify RUSH order coverage in winning alternative (get_rush_coverage)",
        "Step 4: Compute Pareto rank and produce recommendation (compute_pareto_rank)",
      ],
      requiredTools: ["run_constraint_solver", "evaluate_alternative", "get_rush_coverage", "compute_pareto_rank"],
    },
    {
      externalId:    "PKG-004",
      name:          "PKG — Schedule Proposal & Approval Blueprint",
      description:   "4-step proposal pipeline: format Gantt proposal, compute KPI projections, publish for plant planner approval, and commit to Kiwiplan ERP on approval.",
      workflowSteps: [
        "Step 1: Format winning schedule as Gantt proposal (format_gantt_proposal)",
        "Step 2: Compute shift-level KPI projections vs. baseline (compute_kpi_projections)",
        "Step 3: Publish proposal for plant planner approval (publish_for_approval)",
        "Step 4: Commit approved schedule to Kiwiplan (commit_to_kiwiplan)",
      ],
      requiredTools: ["format_gantt_proposal", "compute_kpi_projections", "publish_for_approval", "commit_to_kiwiplan"],
    },
  ];

  const allBlueprints = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const blueprintIdByExternalId: Record<string, string> = {};
  for (const bpDef of PKG_BLUEPRINT_DEFS) {
    let bp = allBlueprints.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:      "manufacturing",
          workflowSteps: bpDef.workflowSteps,
          requiredTools: bpDef.requiredTools,
          outputFormat:  "Structured JSON brief passed to next agent in pipeline",
        },
      });
    }
    blueprintIdByExternalId[bpDef.externalId] = bp.id;
  }

  // ── 7. Agents ───────────────────────────────────────────────────────────────
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  for (const def of PKG_SCHED_AGENT_DEFS) {
    let agent = allAgents.find((a: any) => a.name === def.name);
    const serverId      = _pkgMcpServerIdByName[def.mcpServerName];
    const kbId          = kbIdByName[def.kbName];
    const systemPrompt  = PKG_SCHED_SYSTEM_PROMPTS[def.externalId] || "";
    const agentPolicies = PKG_SCHED_AGENT_POLICIES[def.externalId] || [];
    const blueprintId   = blueprintIdByExternalId[def.externalId];

    const preloadedSkills = def.skillNames
      .map((sn: string) => skillIdByName[sn])
      .filter(Boolean)
      .map((skillId: string) => ({ skillId }));

    const ontologyTags = (def.ontologyTags as string[]).map((label: string) => ({ label }));

    if (!agent) {
      agent = await storage.createAgent({
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
        complianceTags:   def.complianceTags as unknown as string[],
        ontologyTags,
        policyBindings:   agentPolicies.map((p: any) => ({ name: p.name, type: p.type })),
        preloadedSkills:  preloadedSkills as { skillId: string }[],
        blueprintId,
        evalBindings:     [{ suiteName: "PKG Scheduling Regression Suite", schedule: "weekly" }],
        runtimeConfig:    { prompt: def.name, scheduleIntervalMinutes: 0 },
      } as Parameters<typeof storage.createAgent>[0]);
    } else {
      await storage.updateAgent((agent as any).id, {
        systemPrompt,
        preloadedSkills:  preloadedSkills as { skillId: string }[],
        blueprintId,
        modelProvider:    "openai",
        modelName:        "gpt-4.1",
        autonomyMode:     "autonomous",
        maxToolIterations: 6,
      }).catch(() => {});
    }
    _pkgAgentIdByName[def.name] = (agent as any).id;

    // ── Link MCP Server ────────────────────────────────────────────────────
    if (serverId) {
      const existingMcpLinks = await storage.getAgentMcpServers((agent as any).id).catch(() => [] as any[]);
      const alreadyLinked = existingMcpLinks.some((l: any) => l.serverId === serverId);
      if (!alreadyLinked) {
        await storage.createAgentMcpServer({ agentId: (agent as any).id, serverId }).catch(() => {});
      }
    }

    // ── Link Knowledge Base ────────────────────────────────────────────────
    if (kbId) {
      const existingKbLinks = await storage.getAgentKnowledgeBases((agent as any).id).catch(() => [] as any[]);
      const kbAlreadyLinked = existingKbLinks.some((l: any) => l.knowledgeBaseId === kbId);
      if (!kbAlreadyLinked) {
        await storage.createAgentKnowledgeBase({ agentId: (agent as any).id, knowledgeBaseId: kbId }).catch(() => {});
      }
    }
  }

  _pkgSchedSetupDone = true;
  console.log("[pkg-sched] ensurePackagingSchedAgents() complete — 4 agents, 4 blueprints, 3 KBs, 4 MCP servers, 12 skills, 6 policies, 15 ontology concepts provisioned.");
}

// ── Deployment resolution (mirrors OTC Order pattern) ───────────────────────
async function ensurePkgDeployment(agentId: string, agentName: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let dep = (deps as any[])[0];
  if (!dep) {
    dep = await storage.createDeployment({
      agentId,
      agentName,
      environment:      "production",
      status:           "pending",
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: true,
      deployedAt:       new Date(),
    });
  } else if ((dep as any).status === "deployed") {
    await storage.updateDeployment((dep as any).id, { status: "pending" }).catch(() => {});
  }
  _pkgDeploymentIdByName[agentName] = (dep as any).id;
  return (dep as any).id;
}

// ── Pipeline task prompts ───────────────────────────────────────────────────

const PKG_ORDER_TASK = `You are PKG-001 (Production Order Intelligence Agent) for Westfield Packaging Day Shift (April 15, 2026).

TASK: Analyse the 47-order shift queue, identify RUSH orders at delivery risk, validate substrate specifications, and produce the order intelligence brief for the Schedule Optimizer.

Execute these steps using your tools:
1. Call get_shift_context to confirm shift metadata
2. Call get_rush_orders to identify the 3 RUSH orders at risk
3. Call score_delivery_risk to score all 47 orders
4. Call validate_substrate_specs to check B-Flute shortfall risk
5. Call get_order_queue for the complete order list
6. Synthesise findings into a brief: priority queue, substrate status, RUSH order sequencing recommendations

Document your findings clearly — this brief is passed to PKG-003 (Schedule Optimizer).`;

const PKG_CAPACITY_TASK = `You are PKG-002 (Capacity & Constraint Mapping Agent) for Westfield Packaging Day Shift (April 15, 2026).

TASK: Map 8-machine capacity, substrate inventory constraints, changeover penalties, and crew restrictions into the composite constraint map for the Schedule Optimizer.

Execute these steps using your tools:
1. Call get_machine_availability to confirm all 8 machines (note M3 maintenance 10:00–11:30)
2. Call get_roll_stock_inventory to confirm B-Flute at 62% (AT_RISK)
3. Call get_changeover_matrix to retrieve substrate transition times
4. Call get_capacity_constraints for the full constraint map
5. Call estimate_oee to establish the OEE baseline and achievable target
6. Assemble the structured capacity constraint map for PKG-003

Key findings to document: M3 offline 10:00–11:30, M4 at 85% throughput, B-Flute front-loading required.`;

const PKG_OPTIMIZER_TASK = `You are PKG-003 (Schedule Optimization Agent) for Westfield Packaging Day Shift (April 15, 2026).

CONTEXT FROM PARALLEL AGENTS:
- PKG-001 found: 47 orders, 3 RUSH (FreshFarm RSC deadline 13:00, GreenLeaf box deadline 12:30, RetailEdge tray deadline 14:00), B-Flute AT_RISK for 6 orders
- PKG-002 found: M3 offline 10:00–11:30, M4 at 85%, B-Flute depletion risk by 13:00 if unsequenced, 14 changeovers achievable

TASK: Run the constraint solver and identify the Pareto-optimal schedule.

Execute these steps:
1. Call run_constraint_solver to generate 3 alternative schedules
2. Call evaluate_alternative for ALT-A (OEE-priority — the likely winner)
3. Call get_rush_coverage to confirm all 3 RUSH orders are on-time in ALT-A
4. Call compute_pareto_rank to formally confirm the recommendation
5. Document: which alternative is recommended, OEE/OTIF/changeover metrics, RUSH coverage, and rationale

Pass the recommendation to PKG-004 for proposal formatting.`;

const PKG_PROPOSAL_TASK = `You are PKG-004 (Schedule Proposal & Approval Agent) for Westfield Packaging Day Shift (April 15, 2026).

RECOMMENDATION FROM PKG-003: Alternative A (OEE-Priority) selected.
- Projected OEE: 82.2% (baseline 71.0%, +11.2pp)
- OTIF: 44/47 orders on-time (+4 vs. baseline)
- Changeovers: 14 (-3 vs. baseline)
- All 3 RUSH orders covered with comfortable margins
- B-Flute orders front-loaded to 07:00–10:45 window

TASK: Format the schedule proposal, compute KPI projections, publish for approval, and commit to Kiwiplan.

Execute these steps:
1. Call format_gantt_proposal to generate the per-machine Gantt schedule
2. Call compute_kpi_projections to quantify shift-level impact vs. baseline
3. Call publish_for_approval to submit to Plant Planner Sarah Kowalski (15-min SLA)
4. Call commit_to_kiwiplan to finalise the schedule (approval assumed granted in demo)

Present a clear summary: Gantt overview, KPI delta table, approval status, Kiwiplan Schedule ID.`;

// ── Reset state ─────────────────────────────────────────────────────────────
let _pkgSchedRunActive = false;

export function resetPkgSchedDemo(): void {
  _pkgSchedRunActive = false;
}

export async function getPkgSchedAgentRuns(): Promise<Record<string, any[]>> {
  const runs: Record<string, any[]> = {};
  for (const [name, id] of Object.entries(_pkgAgentIdByName)) {
    runs[name] = await storage.getAgentRuntimeRuns(id).catch(() => []);
  }
  return runs;
}

// ── SSE live-run handler ─────────────────────────────────────────────────────
export async function pkgSchedLiveRunHandler(req: Request, res: Response) {
  // Lazy initialization — ensures agents are provisioned on first request
  // (identical pattern to OTC Order; avoids startup race with setDefaultOrgId)
  await ensurePackagingSchedAgents();

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
  };

  const sendError = (msg: string) => {
    send("agent_error", { message: msg });
    res.end();
  };

  if (_pkgSchedRunActive) {
    sendError("A pipeline run is already in progress. Please wait or reset.");
    return;
  }
  _pkgSchedRunActive = true;

  send("run_start", {
    message: "PKG Scheduling Pipeline starting — Westfield Packaging Day Shift 07:00–15:00 · April 15, 2026",
    plant:   "Westfield Packaging",
    shiftDate: "2026-04-15",
    agents:  [PKG_AGT_001_NAME, PKG_AGT_002_NAME, PKG_AGT_003_NAME, PKG_AGT_004_NAME],
  });

  // ── Setup ─────────────────────────────────────────────────────────────────
  try {
    send("setup", { message: "Provisioning PKG agents via Platform APIs…" });
    await ensurePackagingSchedAgents();
    send("setup", { message: `Agents ready: ${PKG_AGT_001_NAME} · ${PKG_AGT_002_NAME} · ${PKG_AGT_003_NAME} · ${PKG_AGT_004_NAME}` });
  } catch (err: any) {
    _pkgSchedRunActive = false;
    sendError(`Agent provisioning failed: ${err.message}`);
    return;
  }

  // Validate agents exist in registry
  const agent1Id = _pkgAgentIdByName[PKG_AGT_001_NAME];
  const agent2Id = _pkgAgentIdByName[PKG_AGT_002_NAME];
  const agent3Id = _pkgAgentIdByName[PKG_AGT_003_NAME];
  const agent4Id = _pkgAgentIdByName[PKG_AGT_004_NAME];

  if (!agent1Id || !agent2Id || !agent3Id || !agent4Id) {
    _pkgSchedRunActive = false;
    sendError(`Agent not found in registry — PKG-001:${!!agent1Id} PKG-002:${!!agent2Id} PKG-003:${!!agent3Id} PKG-004:${!!agent4Id}`);
    return;
  }

  // Resolve deployment IDs (OTC Order pattern — run via deployment, not agent ID)
  let dep1Id: string, dep2Id: string, dep3Id: string, dep4Id: string;
  try {
    [dep1Id, dep2Id, dep3Id, dep4Id] = await Promise.all([
      ensurePkgDeployment(agent1Id, PKG_AGT_001_NAME),
      ensurePkgDeployment(agent2Id, PKG_AGT_002_NAME),
      ensurePkgDeployment(agent3Id, PKG_AGT_003_NAME),
      ensurePkgDeployment(agent4Id, PKG_AGT_004_NAME),
    ]);
    send("setup", { message: `PKG-001 ✓ · PKG-002 ✓ · PKG-003 ✓ · PKG-004 ✓  — All agents deployed · Deployment IDs resolved` });
  } catch (err: any) {
    _pkgSchedRunActive = false;
    sendError(`Deployment resolution failed: ${err.message}`);
    return;
  }

  // Track which deployment IDs belong to this run so runtime events are filtered correctly
  const activeDeploymentIds = new Set<string>([dep1Id, dep2Id, dep3Id, dep4Id]);
  const deploymentIdToName = new Map<string, string>([
    [dep1Id, PKG_AGT_001_NAME],
    [dep2Id, PKG_AGT_002_NAME],
    [dep3Id, PKG_AGT_003_NAME],
    [dep4Id, PKG_AGT_004_NAME],
  ]);

  let aborted = false;

  // Forward agent_execution runtime events (OTC Order pattern: event name = "agent_execution")
  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted || !activeDeploymentIds.has(evt.deploymentId)) return;
    const agentName = deploymentIdToName.get(evt.deploymentId) ?? "Atlas PKG Agent";
    send("agent_event", {
      agentName,
      deploymentId: evt.deploymentId,
      runId:        evt.runId,
      type:         "tool_result",
      data:         evt.result,
    });
  };
  runtimeEvents.on("agent_execution", onRuntimeEvent);

  req.on("close", () => {
    aborted = true;
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  // ── Phase 1: Parallel — PKG-001 + PKG-002 ─────────────────────────────────
  send("parallel_start", {
    message: "Phase 1: PKG-001 (Order Intelligence) + PKG-002 (Capacity Mapper) running in parallel…",
    agents:  [PKG_AGT_001_NAME, PKG_AGT_002_NAME],
    phase:   1,
  });

  let phase1Ok = false;
  try {
    send("agent_start", { role: "order_intelligence",  agentName: PKG_AGT_001_NAME, label: "Order Queue Analysis & RUSH Risk Scoring", parallel: true });
    send("agent_start", { role: "capacity_mapping",    agentName: PKG_AGT_002_NAME, label: "Machine Capacity & Constraint Mapping",    parallel: true });

    await Promise.all([
      runAgentOnce(dep1Id, PKG_ORDER_TASK,    6).then(result => {
        send("agent_complete", {
          role:      "order_intelligence",
          agentName: PKG_AGT_001_NAME,
          success:   true,
          message:   "Order Intelligence complete — 47 orders analysed, 3 RUSH flagged, B-Flute AT_RISK confirmed",
          parallel:  true,
        });
        return result;
      }),
      runAgentOnce(dep2Id, PKG_CAPACITY_TASK, 6).then(result => {
        send("agent_complete", {
          role:      "capacity_mapping",
          agentName: PKG_AGT_002_NAME,
          success:   true,
          message:   "Capacity Map complete — M3 offline 10:00–11:30, B-Flute depletion curve computed, constraint map assembled",
          parallel:  true,
        });
        return result;
      }),
    ]);

    phase1Ok = true;
    send("parallel_complete", {
      message: "Phase 1 complete — Order Intelligence + Capacity Map ready for Schedule Optimizer",
      phase:   1,
    });
  } catch (err: any) {
    aborted = true;
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    _pkgSchedRunActive = false;
    send("agent_error", { role: "parallel_phase", message: `Phase 1 error: ${err.message}` });
    res.end();
    return;
  }

  // ── Phase 2: Sequential — PKG-003 ─────────────────────────────────────────
  send("agent_start", {
    role:      "schedule_optimization",
    agentName: PKG_AGT_003_NAME,
    label:     "Constraint Solver — Generating 3 Alternative Schedules",
    parallel:  false,
    phase:     2,
  });

  let phase2Ok = false;
  try {
    await runAgentOnce(dep3Id, PKG_OPTIMIZER_TASK, 6);
    phase2Ok = true;
    send("agent_complete", {
      role:      "schedule_optimization",
      agentName: PKG_AGT_003_NAME,
      success:   true,
      message:   "Schedule Optimizer complete — Alternative A recommended: OEE +11.2pp, OTIF +4 orders, all 3 RUSH orders on-time",
      phase:     2,
    });
  } catch (err: any) {
    aborted = true;
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    _pkgSchedRunActive = false;
    send("agent_error", { role: "schedule_optimization", message: `PKG-003 error: ${err.message}` });
    res.end();
    return;
  }

  // ── Phase 3: Sequential — PKG-004 ─────────────────────────────────────────
  send("agent_start", {
    role:      "schedule_proposal",
    agentName: PKG_AGT_004_NAME,
    label:     "Schedule Proposal Formatting + Approval Gate + Kiwiplan Commit",
    parallel:  false,
    phase:     3,
  });

  try {
    await runAgentOnce(dep4Id, PKG_PROPOSAL_TASK, 6);
    send("agent_complete", {
      role:      "schedule_proposal",
      agentName: PKG_AGT_004_NAME,
      success:   true,
      message:   "Schedule Proposal published — Kiwiplan ID KWP-SCHED-2026-0415-D · Approval: Awaiting Plant Planner Sarah Kowalski",
      phase:     3,
    });
  } catch (err: any) {
    aborted = true;
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    _pkgSchedRunActive = false;
    send("agent_error", { role: "schedule_proposal", message: `PKG-004 error: ${err.message}` });
    res.end();
    return;
  }

  aborted = true;
  runtimeEvents.off("agent_execution", onRuntimeEvent);
  _pkgSchedRunActive = false;

  send("run_complete", {
    message:       "Predictive Production Scheduling pipeline complete",
    plant:         "Westfield Packaging",
    shiftDate:     "2026-04-15",
    recommendation: "Alternative A",
    kiwiplanScheduleId: "KWP-SCHED-2026-0415-D",
    approvalId:    "APR-2026-04-15-001",
    approver:      "Sarah Kowalski",
    kpiSummary: {
      oee:         "82.2% (+11.2pp vs 71.0% baseline)",
      otif:        "44/47 orders on-time (+4 vs baseline)",
      changeovers: "14 (-3 vs baseline)",
      rushCoverage: "3/3 RUSH orders on-time",
    },
  });

  res.end();
}
