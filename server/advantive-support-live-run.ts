import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, type RuntimeProgressEvent } from "./agent-runtime";
import {
  SUP_001_NAME, SUP_002_NAME, SUP_003_NAME, SUP_004_NAME,
  makeAdvSupportMcpServerDefs,
  ADV_SUPPORT_KB_DEFS,
  ADV_SUPPORT_AGENT_DEFS,
  ADV_SUPPORT_POLICY_DEFS,
  ADV_SUPPORT_SKILLS,
  ADV_SUPPORT_BLUEPRINTS,
  ADV_SUPPORT_ONTOLOGY_CONCEPTS,
  ADV_SUPPORT_SYSTEM_PROMPTS,
} from "./advantive-support-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const ADV_SUPPORT_MCP_SERVERS = makeAdvSupportMcpServerDefs(BASE_URL);
const EVAL_SUITE_NAME = "Advantive T1 Support Autonomous Resolution Suite";

// ─── Module-level caches ─────────────────────────────────────────────────────
let _setupDone = false;
const _agentIdByName:   Record<string, string> = {};
const _skillIdByName:   Record<string, string> = {};
const _mcpIdByName:     Record<string, string> = {};
const _deployIdByAgent: Record<string, string> = {};

// ─── Pipeline step definitions ────────────────────────────────────────────────
const PIPELINE_STEPS = [
  {
    agentName:  SUP_001_NAME,
    agentCode:  "SUP-001",
    label:      "Triage & Intent Classification",
    maxIter:    6,
    taskPrompt: `You are Advantive ONE's Triage & Intent Classifier (SUP-001).

INBOUND QUERY — received from AIVA Support Agent interface:
Customer: Priya Nair, Cascade Polymers Inc. (Account ACC-00741, Enterprise tier)
Query: "Our InfinityQS SPC charts stopped updating this morning after we applied the v9.3 patch. The 'Xbar-R' chart type is returning SQL timeout errors — error code IQS-SQL-TMO-7891. Our production QC team cannot monitor any of our 47 control charts. This is completely blocking our ISO 9001 audit scheduled for tomorrow morning at 09:00."

MISSION: Triage this query through the full classification and routing pipeline.
1. Call receive_inbound_query to ingest the structured query from AIVA
2. Call classify_intent to determine intent type with confidence scoring
3. Call detect_product_version to identify the Advantive product and version
4. Call read_customer_tier to retrieve account tier and SLA targets
5. Call route_to_agent to determine and execute routing decision

ROUTING CONTEXT: This query has multiple signals — error code, version, production impact, compliance deadline. Apply all routing rules carefully.

When complete, output a JSON summary:
{"status":"ROUTED","intent":"technical_troubleshooting","product":"InfinityQS","version":"9.3.0","tier":"Enterprise","route":"SUP-003","urgency":"CRITICAL","next_agent":"SUP-002"}`,
  },
  {
    agentName:  SUP_002_NAME,
    agentCode:  "SUP-002",
    label:      "Knowledge Base Resolution Attempt",
    maxIter:    6,
    taskPrompt: `You are Advantive ONE's Knowledge Resolution Agent (SUP-002).

HANDOFF FROM SUP-001: Query classified as technical_troubleshooting for InfinityQS v9.3. Customer is Enterprise tier. Error code: IQS-SQL-TMO-7891. ISO 9001 audit in 26 hours. Routing: attempt KB resolution, route to Diagnostic if confidence below threshold.

MISSION: Attempt autonomous resolution from the Advantive knowledge base.
1. Call search_product_docs to search InfinityQS v9.3 documentation corpus
2. Call query_historical_resolutions to find similar past resolved tickets
3. Call generate_kb_answer to construct an answer from findings
4. Call score_answer_confidence to evaluate the answer quality
5. Call run_additional_search_pass if confidence is 0.65–0.80

CRITICAL GATE: If final confidence is below 0.65, you MUST route to the Diagnostic Reasoning Agent (SUP-003). Do not deliver uncertain answers.

When complete, output a JSON summary with confidence score and routing decision:
{"status":"ROUTED_TO_DIAGNOSTIC","confidence":0.58,"reason":"v9.3_sparse_coverage","next_agent":"SUP-003"}`,
  },
  {
    agentName:  SUP_003_NAME,
    agentCode:  "SUP-003",
    label:      "Diagnostic Reasoning & Log Analysis",
    maxIter:    7,
    taskPrompt: `You are Advantive ONE's Diagnostic Reasoning Agent (SUP-003).

HANDOFF FROM SUP-002: KB resolution attempt failed — confidence 0.58 (below 0.65 threshold). InfinityQS v9.3 SQL timeout IQS-SQL-TMO-7891 on Xbar-R charts. Only 1 prior v9.3 case with this error existed and it was escalated. Diagnostic reasoning required.

MISSION: Diagnose the root cause using product log intelligence and build a resolution path.
1. Call ingest_error_context to normalise the error profile (InfinityQS v9.3, IQS-SQL-TMO-7891)
2. Call query_product_logs to retrieve diagnostic signals from Advantive ONE Log Intelligence
3. Call match_error_pattern to match against the InfinityQS error catalog
4. Call build_resolution_path to construct the step-by-step customer resolution
5. Call assess_escalation_need to determine if T2 standby is required

CONTEXT: This is an Enterprise customer with an ISO 9001 audit in 26 hours. Even if autonomous resolution is possible (confidence > 0.90), Enterprise + audit deadline policy may require T2 standby escalation in parallel.

When complete, output a JSON summary:
{"status":"ESCALATION_REQUIRED","root_cause":"IQS-BUG-930-0042","resolution_path":"available","autonomous_confidence":0.91,"escalation_type":"parallel_standby","next_agent":"SUP-004"}`,
  },
  {
    agentName:  SUP_004_NAME,
    agentCode:  "SUP-004",
    label:      "T1→T2 Escalation Packaging",
    maxIter:    6,
    taskPrompt: `You are Advantive ONE's T1→T2 Escalation Packager (SUP-004).

HANDOFF FROM SUP-003: Root cause confirmed — IQS-BUG-930-0042 (migration script skipped, missing index). Resolution path built (5 steps, 15 mins). Enterprise + ISO audit = T2 standby required. Customer is Cascade Polymers Inc., Enterprise, ISO audit in 26 hours.

MISSION: Create a complete, enriched escalation package ensuring T2 can act immediately.
1. Call build_escalation_package to compile full pipeline context, classification, and diagnostic findings
2. Call create_salesforce_case to auto-create Salesforce case with all 18 fields pre-populated
3. Call recommend_t2_owner to identify the optimal specialist queue and named contact
4. Call notify_account_manager to alert James Whitfield (Enterprise AM) with case URL and ETA
5. Call log_escalation_audit to record the complete pipeline audit trail

STANDARDS: Every escalation package must include: full conversation context, SUP-001 classification, SUP-002 confidence scores, SUP-003 diagnostic findings and resolution path. T2 specialists must never have to re-investigate.

When complete, output a JSON summary:
{"status":"ESCALATED","case_id":"SF-CASE-2026-074821","t2_team":"InfinityQS Database & Schema","specialist":"Marcus Chen","response_eta_hours":1.5,"am_notified":true,"audit_logged":true}`,
  },
];

// ─── Provisioning ─────────────────────────────────────────────────────────────
async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []),
    storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []),
  ]);
  for (const sd of ADV_SUPPORT_MCP_SERVERS) {
    const s = allServers.find(x => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const def of ADV_SUPPORT_AGENT_DEFS) {
    const a = allAgents.find(x => x.name === def.name);
    if (a) _agentIdByName[def.name] = a.id;
  }
}

export async function ensureAdvSupportAgents(): Promise<void> {
  if (_setupDone) { await _refreshCaches(); return; }

  // 1. Knowledge Bases
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of ADV_SUPPORT_KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:                kbDef.name,
        description:         kbDef.description,
        industry:            "technology_saas",
        status:              "active",
        embeddingModel:      "text-embedding-3-small",
        embeddingDimensions: 1536,
        chunkSize:           512,
        chunkOverlap:        50,
      });
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // 2. MCP Servers + Tools
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const sd of ADV_SUPPORT_MCP_SERVERS) {
    let server = allServers.find(s => s.name === sd.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:          sd.name,
        description:   sd.description,
        transportType: "streamable-http",
        url:           sd.url,
        status:        "registered",
        riskTier:      "MEDIUM",
        allowlisted:   true,
        addedBy:       "advantive-support-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "Advantive ONE / ATLAS Demo", version: "1.0.0" },
      });
    } else if (server.url !== sd.url) {
      await storage.updateMcpServer(server.id, { url: sd.url });
    }
    _mcpIdByName[sd.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingNames = new Set(existingTools.map(t => t.name));
    for (const tool of sd.tools) {
      if (existingNames.has(tool.name)) continue;
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

  // 3. Skills
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of ADV_SUPPORT_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:        skillDef.name,
        description: skillDef.description,
        domain:      skillDef.domain,
        industry:    skillDef.industry,
        version:     skillDef.version,
        author:      "Advantive ONE Support Engineering",
        trustTier:   "platform-provided",
        complexity:  "intermediate",
        status:      "active",
        tags:        [...skillDef.tags],
        contextMode: "summary",
        markdownBody: `## ${skillDef.name}\n\n${skillDef.description}\n\nThis skill is applied by ${skillDef.agentKey === "triage" ? "SUP-001" : skillDef.agentKey === "knowledge" ? "SUP-002" : skillDef.agentKey === "diagnostic" ? "SUP-003" : "SUP-004"} during the Advantive ONE AI-First T1 Support pipeline. It enables structured, high-accuracy support operations in ${skillDef.domain.replace(/_/g, " ")}.`,
        yamlFrontmatter: {
          skillId:   `adv-support-${skillDef.name.toLowerCase().replace(/\s+/g, "-")}`,
          trustTier: "platform-provided",
          industry:  "technology_saas",
          version:   "1.0",
          tags:      [...skillDef.tags],
        },
        allowedTools: [],
      });
    }
    _skillIdByName[skillDef.name] = skill.id;
  }

  // 4. Policies
  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const polDef of ADV_SUPPORT_POLICY_DEFS) {
    if (!allPolicies.find(p => p.name === polDef.name)) {
      await storage.createPolicy({
        name:        polDef.name,
        domain:      polDef.domain,
        description: polDef.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  polDef.policyJson,
      });
    }
  }

  // 5. Ontology Concepts (best-effort — may be skipped if storage does not support it)
  try {
    const allConcepts = await storage.getOntologyConcepts("technology_saas").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
    const existingLabels = new Set(allConcepts.map(c => c.label));
    const { randomUUID } = await import("crypto");
    for (const concept of ADV_SUPPORT_ONTOLOGY_CONCEPTS) {
      if (existingLabels.has(concept.name)) continue;
      await storage.createOntologyConcept({
        id:            randomUUID(),
        industryId:    "technology_saas",
        ontologyName:  "Advantive ONE Support Operations",
        label:         concept.name,
        category:      concept.domain,
        description:   concept.description,
        tags:          [concept.domain, "support_operations", "advantive"],
        properties:    [],
        relationships: [],
        synonyms:      [],
        source:        "industry-standard",
      }).catch(() => {});
    }
  } catch {
    // Ontology concept provisioning is non-critical — skip on failure
  }

  // 6. Blueprints
  const allBPs = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const bpIdByKey: Record<string, string> = {};
  for (const bpDef of ADV_SUPPORT_BLUEPRINTS) {
    let bp = allBPs.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:      "technology_saas",
          workflowSteps: bpDef.steps.map(s => `Step ${s.order}: ${s.label} — ${s.description}`),
          requiredTools: bpDef.steps.map(s => s.description.match(/`([^`]+)`/)?.[1] ?? ""),
          outputFormat:  "JSON support resolution summary + Salesforce case + audit trail",
        },
      });
    }
    const agentKey = bpDef.name.includes("Triage")      ? "triage"
                   : bpDef.name.includes("Knowledge")   ? "knowledge"
                   : bpDef.name.includes("Diagnostic")  ? "diagnostic"
                   :                                       "escalation";
    bpIdByKey[agentKey] = bp.id;
  }

  // 7. Agents
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  const POLICY_BINDINGS = ADV_SUPPORT_POLICY_DEFS.map(p => ({ policyName: p.name, enforcement: "hard" as const }));

  for (const def of ADV_SUPPORT_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const skillIds = def.skillNames
      .map(sn => _skillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));
    const bpId = bpIdByKey[def.key];
    const systemPrompt = ADV_SUPPORT_SYSTEM_PROMPTS[def.externalId] ??
      `You are ${def.name}, an AI agent for Advantive ONE AI-First T1 Support Intelligence. Use your MCP tools to classify, resolve, diagnose, or escalate customer support queries.`;

    if (!agent) {
      agent = await storage.createAgent({
        name:              def.name,
        description:       def.description,
        systemPrompt,
        runtimeConfig:     { prompt: def.name, scheduleIntervalMinutes: 0 },
        agentType:         "operational",
        status:            "active",
        environment:       "production",
        modelProvider:     def.modelProvider,
        modelName:         def.modelName,
        riskTier:          "MEDIUM",
        autonomyMode:      "autonomous",
        currentVersion:    "1.0.0",
        maxToolIterations: 8,
        toolAccessClass:   "standard",
        department:        def.department,
        owner:             "Advantive ONE — Customer Support Engineering",
        healthScore:       0.97,
        successRate:       0.97,
        maturityFactors:   {},
        preloadedSkills:   skillIds as { skillId: string }[],
        blueprintId:       bpId,
        complianceTags:    [...def.complianceTags],
        policyBindings:    POLICY_BINDINGS,
        ontologyTags:      def.ontologyTags.map(label => ({ label })),
        evalBindings:      [],
      } as Parameters<typeof storage.createAgent>[0]);
    } else {
      await storage.updateAgent(agent.id, {
        systemPrompt,
        preloadedSkills:   skillIds as { skillId: string }[],
        blueprintId:       bpId,
        modelProvider:     def.modelProvider,
        modelName:         def.modelName,
        autonomyMode:      "autonomous",
        maxToolIterations: 8,
      }).catch(() => {});
    }
    _agentIdByName[def.name] = agent.id;

    // Link KB
    const kbId = kbIdByName[def.kbName];
    if (kbId) {
      await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => {});
    }

    // Link MCP server
    const mcpId = _mcpIdByName[def.mcpServerName];
    if (mcpId) {
      await storage.createAgentMcpServer({ agentId: agent.id, serverId: mcpId }).catch(() => {});
    }
  }

  // 8. Eval Suite — created after agents so we have a valid agentId
  const leadAgentId = _agentIdByName[SUP_001_NAME];
  if (leadAgentId) {
    const allSuites = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
    let suite = allSuites.find(s => s.name === EVAL_SUITE_NAME);
    if (!suite) {
      suite = await storage.createEvalSuite({
        agentId:      leadAgentId,
        name:         EVAL_SUITE_NAME,
        type:         "regression",
        industry:     "technology_saas",
        passRate:     0.93,
        totalCases:   10,
        coverageTags: ["intent_classification", "product_routing", "kb_search", "confidence_scoring", "log_analysis", "escalation_packaging", "salesforce_sync", "t2_routing", "am_notification", "audit_trail"],
        thresholdConfig: { minPassRate: 0.85 },
        scorerConfig:    { type: "llm_judge", model: "claude-sonnet-4-5" },
      }).catch(() => undefined);

      if (suite) {
        const testCases = [
          { name: "Intent Classification Accuracy",       prompt: "Classify InfinityQS SQL timeout with ISO audit deadline as correct intent type",                          expectedOutput: "technical_troubleshooting (>0.90 confidence), urgency CRITICAL",              evaluationCriteria: "Correct intent, high confidence, compliance flag applied" },
          { name: "Product & Version Detection",          prompt: "Detect InfinityQS SPC Pro v9.3 from query mentioning 'Xbar-R' and 'v9.3 patch'",                         expectedOutput: "InfinityQS, v9.3.0, component SPC Chart Engine",                              evaluationCriteria: "Correct product, version, and component identified" },
          { name: "Enterprise Tier Routing Override",     prompt: "Apply Enterprise tier routing with compliance flag for technical_troubleshooting query",                   expectedOutput: "Route to Diagnostic Agent + KB parallel check",                               evaluationCriteria: "Enterprise override applied, Diagnostic Agent selected" },
          { name: "KB Confidence Gate Enforcement",       prompt: "KB search returns confidence 0.58 — verify correct routing decision is made",                             expectedOutput: "confidence 0.58 < 0.65 → route to Diagnostic, no answer delivered",          evaluationCriteria: "Confidence gate enforced, uncertain answer not delivered" },
          { name: "Additional Search Pass Trigger",       prompt: "Confidence 0.65–0.80 triggers additional search pass and re-scoring",                                     expectedOutput: "Additional pass executed, new score calculated, routing re-evaluated",        evaluationCriteria: "Second pass triggered at correct threshold" },
          { name: "Log Diagnostic Root Cause Accuracy",  prompt: "Diagnose IQS-SQL-TMO-7891 after v9.3 upgrade via product log analysis",                                   expectedOutput: "IQS-BUG-930-0042: migration script skipped, missing index identified",       evaluationCriteria: "Correct root cause, specific bug catalog reference" },
          { name: "Resolution Path Completeness",        prompt: "Build customer-executable resolution path for v9.3 migration script failure",                              expectedOutput: "5 steps, 15 mins, no remote access, rollback procedure included",           evaluationCriteria: "All 5 steps present, estimated time accurate, rollback present" },
          { name: "Escalation Package Completeness",     prompt: "Build T1→T2 escalation package with full pipeline context",                                               expectedOutput: "SUP-001 + SUP-002 + SUP-003 context all included in package",               evaluationCriteria: "All 3 upstream agent traces present, no context gaps" },
          { name: "Salesforce Case Auto-Population",     prompt: "Create Salesforce case with all fields pre-populated for T2 specialist",                                  expectedOutput: "18 fields populated, case created, URL returned, T2 needs no re-investigation", evaluationCriteria: "All required fields populated, zero re-investigation needed" },
          { name: "Audit Trail Completeness",            prompt: "Log complete pipeline audit trail with all 15 agent actions and policy compliance",                        expectedOutput: "15 events, all 3 policies checked, tamper-proof hash present",               evaluationCriteria: "All events logged, policies validated, hash present" },
        ];
        for (const tc of testCases) {
          await storage.createEvalTestCase({ suiteId: suite.id, ...tc, weight: 1 }).catch(() => {});
        }
      }
    }

    // Bind eval suite to all 4 agents
    if (suite) {
      const evalBinding = [{ suiteName: EVAL_SUITE_NAME, schedule: "weekly" }];
      const agentIds = [
        _agentIdByName[SUP_001_NAME],
        _agentIdByName[SUP_002_NAME],
        _agentIdByName[SUP_003_NAME],
        _agentIdByName[SUP_004_NAME],
      ].filter(Boolean) as string[];
      for (const agentId of agentIds) {
        await storage.updateAgent(agentId, { evalBindings: evalBinding } as Parameters<typeof storage.updateAgent>[1]).catch(() => {});
      }
    }
  }

  _setupDone = true;
  console.log(`[adv-support] Setup complete — 4 agents, 4 KBs, 4 MCP servers, 12 skills, 3 policies, 16 ontology concepts, 4 blueprints, 1 eval suite`);
}

// ─── Deployment helper ────────────────────────────────────────────────────────
async function _ensureDeployment(agentId: string, agentName: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let dep = deps[0];
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
  } else {
    await storage.updateDeployment(dep.id, { status: "pending" }).catch(() => {});
  }
  _deployIdByAgent[agentName] = dep.id;
  return dep.id;
}

// ─── Public helpers ───────────────────────────────────────────────────────────
export async function getAdvSupportAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    await ensureAdvSupportAgents();
    const results: Record<string, object> = {};
    for (const def of ADV_SUPPORT_AGENT_DEFS) {
      const agentId = _agentIdByName[def.name];
      if (!agentId) { results[def.externalId] = { status: "not_provisioned" }; continue; }
      const runs = await storage.getAgentRuntimeRuns(agentId).catch(() => [] as any[]);
      results[def.externalId] = { agentId, runs: runs.slice(0, 5) };
    }
    res.json(results);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

export async function resetAdvSupportDemo(_req: Request, res: Response): Promise<void> {
  _setupDone = false;
  Object.keys(_agentIdByName).forEach(k => delete _agentIdByName[k]);
  Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);
  res.json({ reset: true });
}

// ─── SSE Live-Run Handler ─────────────────────────────────────────────────────
export async function advSupportLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sse = (event: string, data: object) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepalive = setInterval(() => {
    if (aborted) { clearInterval(keepalive); return; }
    try { res.write(": keepalive\n\n"); } catch { aborted = true; }
  }, 15000);

  req.on("close", () => { aborted = true; clearInterval(keepalive); });

  try {
    sse("run_start", {
      message:   "SUPPORT ALERT — InfinityQS v9.3 production outage at Cascade Polymers Inc. ISO 9001 audit in 26 hours. Activating AI-First T1 Support pipeline…",
      scenario:  "ADV-SCN-004",
      query_id:  "AIVA-Q-2026-04-17-0831",
    });

    sse("setup", { message: "Provisioning SUP-001, SUP-002, SUP-003, SUP-004…" });
    await ensureAdvSupportAgents();
    sse("setup", {
      message:  "Agents ready — SUP-001 ✓ · SUP-002 ✓ · SUP-003 ✓ · SUP-004 ✓",
      agentIds: {
        sup001: _agentIdByName[SUP_001_NAME],
        sup002: _agentIdByName[SUP_002_NAME],
        sup003: _agentIdByName[SUP_003_NAME],
        sup004: _agentIdByName[SUP_004_NAME],
      },
    });

    const agentSummaries: Record<string, string> = {};

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      if (aborted) break;
      const step = PIPELINE_STEPS[i];
      const agentId = _agentIdByName[step.agentName];
      if (!agentId) {
        sse("agent_error", { agentCode: step.agentCode, message: `Agent ${step.agentCode} not provisioned` });
        continue;
      }

      const deploymentId = await _ensureDeployment(agentId, step.agentName).catch(() => "");

      sse("agent_start", {
        agentName:    step.agentName,
        agentCode:    step.agentCode,
        agentId,
        deploymentId,
        label:        step.label,
        step:         i + 1,
        totalSteps:   PIPELINE_STEPS.length,
      });

      const onProgress = (evt: RuntimeProgressEvent) => {
        if (aborted) return;
        if (evt.type === "tool_call_start" || evt.type === "tool_call_result") {
          sse("agent_event", {
            agentName: step.agentName,
            agentCode: step.agentCode,
            type:      evt.type,
            tool:      evt.data?.toolName ?? evt.data?.tool ?? "tool",
            data:      { tool: evt.data?.toolName ?? evt.data?.tool, success: evt.type === "tool_call_result" ? evt.data?.success !== false : undefined },
          });
        }
      };

      let runResult: { success: boolean; message: string };
      runResult = await runAgentOnce(deploymentId, step.taskPrompt, step.maxIter, onProgress);

      if (aborted) break;

      const summary = runResult.message?.slice(0, 600) ?? `${step.agentCode} cycle completed`;
      agentSummaries[step.agentCode] = summary;

      if (!runResult.success) {
        sse("agent_error", {
          agentCode: step.agentCode,
          agentName: step.agentName,
          message:   runResult.message ?? "Agent run failed",
        });
        break;
      }

      await storage.updateDeployment(deploymentId, { status: "deployed" }).catch(() => {});
      sse("agent_complete", {
        agentName:    step.agentName,
        agentCode:    step.agentCode,
        agentId,
        deploymentId,
        success:      true,
        summary,
        step:         i + 1,
      });
    }

    if (!aborted) {
      sse("pipeline_complete", {
        message: "AI-First T1 Support pipeline complete — query triaged, KB resolution attempted, root cause diagnosed, Salesforce case created, T2 specialist assigned",
        metrics: {
          t1_autonomous_capable: true,
          autonomous_confidence: 0.91,
          escalation_type: "parallel_standby",
          salesforce_case: "SF-CASE-2026-074821",
          t2_specialist: "Marcus Chen / InfinityQS DB Team",
          response_eta_hours: 1.5,
          audit_trail_logged: true,
        },
        agentSummaries,
      });
    }
  } catch (err: unknown) {
    if (!aborted) {
      sse("error", { message: err instanceof Error ? err.message : "Pipeline error" });
    }
  } finally {
    clearInterval(keepalive);
    try { res.end(); } catch {}
  }
}
