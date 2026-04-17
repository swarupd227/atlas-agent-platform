import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, runtimeEvents } from "./agent-runtime";
import {
  OTC_AGT_005_NAME, OTC_AGT_007_NAME, OTC_AGT_012_NAME,
  makeOtcFulfillmentMcpServerDefs,
  OTC_FULFILLMENT_KB_DEFS,
  OTC_FULFILLMENT_AGENT_DEFS,
  OTC_FULFILLMENT_POLICY_DEFS,
  OTC_FULFILLMENT_SKILLS,
  OTC_FULFILLMENT_BLUEPRINTS,
  OTC_FULFILLMENT_ONTOLOGY_CONCEPTS,
  OTC_FULFILLMENT_SYSTEM_PROMPTS,
} from "./otc-fulfillment-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const OTC_FULFILLMENT_MCP_SERVERS = makeOtcFulfillmentMcpServerDefs(BASE_URL);
const EVAL_SUITE_NAME = "OTC Fulfillment Exception Regression Suite";

// ─── Module-level caches ────────────────────────────────────────────────────
let _setupDone = false;
const _agentIdByName:    Record<string, string> = {};
const _skillIdByName:    Record<string, string> = {};
const _mcpIdByName:      Record<string, string> = {};
const _deployIdByAgent:  Record<string, string> = {};

// ─── Pipeline step definitions ───────────────────────────────────────────────
const PIPELINE_STEPS = [
  {
    agentName: OTC_AGT_005_NAME,
    agentCode:  "OTC-AGT-005",
    label:     "Disruption Assessment & Rerouting",
    maxIter:   6,
    taskPrompt: `You are NovaTech's Fulfillment & Exception Agent (OTC-AGT-005).

SITUATION: Winter Storm Stella has just hit the Midwest. Your DC network monitoring has triggered a CRITICAL disruption alert.

AFFECTED FACILITIES:
- Chicago DC (WH-CHI-001): OUTBOUND SUSPENDED — 523 shipments affected
- Indianapolis DC (WH-IND-001): OUTBOUND SUSPENDED — 198 shipments affected
- St. Louis DC (WH-STL-001): OUTBOUND SUSPENDED — 126 shipments affected

TOTAL IMPACT: 847 shipments affected. 312 are Platinum/Gold tier customers with active SLA commitments representing $4.8M revenue.

MISSION: Within the next 8 minutes, you must:
1. Call detect_storm_disruption to confirm the disruption scope
2. Call get_affected_shipments to get the full breakdown of 847 affected shipments by tier and SLA urgency
3. Call assess_dc_capacity to verify available capacity at Dallas, Atlanta, and Philadelphia DCs
4. Call propose_rerouting_strategy to generate Smart, Full, and Hold options with cost/SLA analysis
5. Call execute_rerouting to execute the Smart Reroute (312 priority shipments — Dallas: 145, Atlanta: 98, Philadelphia: 69)

AUTHORITY: You are pre-authorised to execute rerouting of up to 400 priority shipments with incremental cost under $60K without VP approval. Smart Reroute ($47.2K) is within your authority.

When complete, output a JSON summary:
{"status":"EXECUTED","strategy":"SMART_REROUTE","rerouted":312,"cost_usd":47200,"sla_saved_pct":92.6,"next_agent":"OTC-AGT-007"}`,
  },
  {
    agentName: OTC_AGT_007_NAME,
    agentCode:  "OTC-AGT-007",
    label:     "Carrier Signal Ingestion & Routing Update",
    maxIter:   5,
    taskPrompt: `You are NovaTech's Delivery Tracking & Confirmation Agent (OTC-AGT-007).

HANDOFF FROM OTC-AGT-005: Smart Reroute has been executed. 312 priority shipments have been assigned to alternate DCs:
- Dallas DC: 145 shipments
- Atlanta DC: 98 shipments
- Philadelphia DC: 69 shipments

MISSION: Confirm carrier alignment, update routing records, and deliver revised ETAs.
1. Call get_carrier_delay_signals to confirm UPS/FedEx/USPS service status for Midwest lanes and alternate DC inbound lanes
2. Call get_shipment_status_bulk to retrieve current status of all 312 priority shipments
3. Call update_shipment_routing to post new origin DC assignments and re-book carrier pickups at alternate DCs
4. Call confirm_alternate_etas to validate revised delivery dates and identify the 23 remaining at-risk shipments

KEY OUTCOMES:
- 289 of 312 priority shipments should achieve SLA-compliant delivery
- 23 shipments (mostly Platinum, remote Midwest zip codes) will still be at breach risk — flag these for account manager contact
- All routing updates must include carrier booking reference and pickup window

When complete, output a JSON summary:
{"status":"UPDATED","records_updated":312,"sla_compliant":289,"sla_breach_remaining":23,"next_agent":"OTC-AGT-012"}`,
  },
  {
    agentName: OTC_AGT_012_NAME,
    agentCode:  "OTC-AGT-012",
    label:     "Customer Notification Dispatch",
    maxIter:   5,
    taskPrompt: `You are NovaTech's Customer Communication & Notification Agent (OTC-AGT-012).

HANDOFF FROM OTC-AGT-007: Routing is confirmed. 289 of 312 priority shipments have SLA-compliant revised ETAs. 23 remain at breach risk. 535 standard shipments are held for DC recovery.

MISSION: Proactively notify all 847 affected customers before a single one calls to complain.
1. Call get_customer_tier_profiles to segment 87 Platinum, 225 Gold, and 535 Standard customers
2. Call generate_notification_batch to create personalised delay notifications for all 847 customers using tier-appropriate templates
3. Call queue_notifications to schedule multi-channel dispatch (email + SMS for Platinum/Gold, portal for Standard)
4. Call get_send_status to confirm delivery metrics and surface the escalation queue

TIER STANDARDS:
- Platinum (87): Personal email from account manager, specific shipment detail, new ETA, $500 credit offer
- Gold (225): Branded NovaTech email with order detail, new ETA, $200 credit offer
- Standard (535): Portal notification with order number, general delay notice, 48-72h recovery estimate

CRITICAL: Never send a generic blast. Every notification must include the customer's specific shipment reference and revised ETA.

When complete, output a JSON summary with notification metrics and any escalation items.`,
  },
];

// ─── Provisioning ────────────────────────────────────────────────────────────

async function _refreshCaches(): Promise<void> {
  const [allServers, allAgents] = await Promise.all([
    storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []),
    storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []),
  ]);
  for (const sd of OTC_FULFILLMENT_MCP_SERVERS) {
    const s = allServers.find(x => x.name === sd.name);
    if (s) _mcpIdByName[sd.name] = s.id;
  }
  for (const def of OTC_FULFILLMENT_AGENT_DEFS) {
    const a = allAgents.find(x => x.name === def.name);
    if (a) _agentIdByName[def.name] = a.id;
  }
}

export async function ensureOtcFulfillmentAgents(): Promise<void> {
  if (_setupDone) { await _refreshCaches(); return; }

  // 1. Knowledge Bases
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of OTC_FULFILLMENT_KB_DEFS) {
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

  // 2. MCP Servers + Tools
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const sd of OTC_FULFILLMENT_MCP_SERVERS) {
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
        addedBy:       "otc-fulfillment-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
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
  for (const skillDef of OTC_FULFILLMENT_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:        skillDef.name,
        description: skillDef.description,
        domain:      skillDef.domain,
        industry:    skillDef.industry,
        version:     skillDef.version,
        author:      "NovaTech Order-to-Cash Engineering",
        trustTier:   "platform-provided",
        complexity:  "intermediate",
        status:      "active",
        tags:        [...skillDef.tags],
        contextMode: "summary",
        markdownBody: `## ${skillDef.name}\n\n${skillDef.description}\n\nThis skill is applied by ${skillDef.agentKey === "fulfillmentException" ? "OTC-AGT-005" : skillDef.agentKey === "deliveryTracking" ? "OTC-AGT-007" : "OTC-AGT-012"} during the Fulfillment Exception Command Center pipeline. It enables structured, data-driven responses to DC disruption events by providing domain expertise in ${skillDef.domain.replace(/_/g, " ")}.`,
        yamlFrontmatter: {
          skillId:   `otc-fulfillment-${skillDef.name.toLowerCase().replace(/\s+/g, "-")}`,
          trustTier: "platform-provided",
          industry:  "manufacturing",
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
  for (const polDef of OTC_FULFILLMENT_POLICY_DEFS) {
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

  // 5. Ontology Concepts
  const allConcepts = await storage.getOntologyConcepts("manufacturing").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingLabels = new Set(allConcepts.map(c => c.label));
  const { randomUUID } = await import("crypto");
  for (const concept of OTC_FULFILLMENT_ONTOLOGY_CONCEPTS) {
    if (existingLabels.has(concept.name)) continue;
    await storage.createOntologyConcept({
      id:            randomUUID(),
      industryId:    "manufacturing",
      ontologyName:  "NovaTech Order-to-Cash",
      label:         concept.name,
      category:      concept.domain,
      description:   concept.description,
      tags:          [concept.domain, "fulfillment", "exception_management"],
      properties:    [],
      relationships: [],
      synonyms:      [],
      source:        "industry-standard",
    });
  }

  // 6. Blueprints
  const allBPs = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const bpIdByKey: Record<string, string> = {};
  for (const bpDef of OTC_FULFILLMENT_BLUEPRINTS) {
    let bp = allBPs.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:      "manufacturing",
          workflowSteps: bpDef.steps.map(s => `Step ${s.order}: ${s.label} — ${s.description}`),
          requiredTools: bpDef.steps.map(s => s.description.match(/`([^`]+)`/)?.[1] ?? ""),
          outputFormat:  "JSON crisis response summary + audit trail",
        },
      });
    }
    const agentKey = bpDef.name.includes("Disruption") ? "fulfillmentException"
                   : bpDef.name.includes("Tracking")   ? "deliveryTracking"
                   :                                      "customerComm";
    bpIdByKey[agentKey] = bp.id;
  }

  // 7. Agents (eval suite created after, as it requires an agentId)
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  const POLICY_BINDINGS = OTC_FULFILLMENT_POLICY_DEFS.map(p => ({ policyName: p.name, enforcement: "hard" as const }));

  for (const def of OTC_FULFILLMENT_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const skillIds = def.skillNames
      .map(sn => _skillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));
    const bpId = bpIdByKey[def.key];
    const systemPrompt = OTC_FULFILLMENT_SYSTEM_PROMPTS[def.externalId] ??
      `You are ${def.name}, an AI agent for NovaTech Industries Fulfillment Exception Command Center. Use your MCP tools to respond to DC disruptions, reroute shipments, and communicate with customers.`;

    if (!agent) {
      agent = await storage.createAgent({
        name:              def.name,
        description:       def.description,
        systemPrompt,
        runtimeConfig:     { prompt: def.name, scheduleIntervalMinutes: 0 },
        agentType:         "operational",
        status:            "active",
        environment:       "production",
        modelProvider:     "openai",
        modelName:         "gpt-4.1",
        riskTier:          "MEDIUM",
        autonomyMode:      "autonomous",
        currentVersion:    "1.0.0",
        maxToolIterations: 8,
        toolAccessClass:   "standard",
        department:        def.department,
        owner:             "NovaTech Industries — Supply Chain Engineering",
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
        preloadedSkills: skillIds as { skillId: string }[],
        blueprintId:     bpId,
        modelProvider:   "openai",
        modelName:       "gpt-4.1",
        autonomyMode:    "autonomous",
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

  // 8. Eval Suite — created after agents so we have a valid agentId (required column)
  const leadAgentId = _agentIdByName[OTC_AGT_005_NAME];
  if (leadAgentId) {
    const allSuites = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
    let suite = allSuites.find(s => s.name === EVAL_SUITE_NAME);
    if (!suite) {
      suite = await storage.createEvalSuite({
        agentId:     leadAgentId,
        name:        EVAL_SUITE_NAME,
        type:        "regression",
        industry:    "manufacturing",
        passRate:    0.95,
        totalCases:  10,
        coverageTags: ["disruption_detection", "rerouting_strategy", "sla_protection", "carrier_signals", "customer_notification", "tier_compliance", "escalation_routing"],
        thresholdConfig: { minPassRate: 0.90 },
        scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
      }).catch(() => undefined);
      if (suite) {
        const testCases = [
          { name: "Storm Disruption Detection",     prompt: "Detect active winter storm disruption — confirm all 3 affected DCs and shipment count",        expectedOutput: "3 DCs affected, 847 shipments",                                       evaluationCriteria: "Correct DC count and shipment enumeration" },
          { name: "Priority Triage Accuracy",       prompt: "Classify 847 shipments by SLA risk — identify 312 priority accounts",                          expectedOutput: "312 priority, 489 standard",                                          evaluationCriteria: "Correct tier classification and SLA mapping" },
          { name: "DC Capacity Verification",       prompt: "Assess alternate DC capacity — confirm Dallas, Atlanta, Philadelphia can absorb 312 shipments", expectedOutput: "Total capacity 512 > 312 required",                                   evaluationCriteria: "Capacity sum > requirement, recommendations correct" },
          { name: "Smart Reroute Cost Calculation", prompt: "Propose rerouting strategies and identify Smart Reroute cost",                                  expectedOutput: "$47,200 incremental cost, 93% SLA save",                              evaluationCriteria: "Correct cost and SLA percentage" },
          { name: "Reroute Execution Authority",    prompt: "Confirm Smart Reroute is within automated pre-auth threshold",                                  expectedOutput: "Approved — under $60K threshold",                                    evaluationCriteria: "Correct authority determination" },
          { name: "Carrier Signal Interpretation",  prompt: "Interpret UPS/FedEx/USPS delay signals for Midwest lanes",                                      expectedOutput: "All 3 carriers disrupted, alternate DC inbound lanes clear",          evaluationCriteria: "Correct carrier status and alternate route assessment" },
          { name: "ETA Compliance Rate",            prompt: "Confirm revised ETAs for 312 rerouted shipments",                                               expectedOutput: "289 SLA-compliant, 23 at-risk",                                      evaluationCriteria: "Correct compliance count and at-risk identification" },
          { name: "Tier Notification Compliance",   prompt: "Generate notifications with correct tier templates",                                             expectedOutput: "87 Platinum (AM email), 225 Gold (branded), 535 Standard (portal)", evaluationCriteria: "Correct template assignment, no generic blasts" },
          { name: "Notification Queue Speed",       prompt: "Queue all 847 notifications within SLA window",                                                 expectedOutput: "All queued within 30 minutes, Platinum first",                       evaluationCriteria: "Priority sequencing correct, SLA met" },
          { name: "Escalation Routing",             prompt: "Identify and route negative sentiment responses",                                                expectedOutput: "3 customers in escalation queue with account manager assignment",    evaluationCriteria: "Correct sentiment classification and escalation routing" },
        ];
        for (const tc of testCases) {
          await storage.createEvalTestCase({ suiteId: suite.id, ...tc, weight: 1 }).catch(() => {});
        }
      }
    }
  }

  _setupDone = true;
  console.log(`[otc-fulfillment] Setup complete — 3 agents, 3 KBs, 3 MCP servers, 9 skills, 3 policies, 12 ontology concepts, 3 blueprints, 1 eval suite`);
}

// ─── Deployment helper ───────────────────────────────────────────────────────
async function _ensureDeployment(agentId: string, agentName: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let dep = deps[0];
  if (!dep) {
    dep = await storage.createDeployment({
      agentId,
      agentName,
      environment:     "production",
      status:          "pending",
      version:         "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent:   100,
      pipelineComplete: true,
      deployedAt:      new Date(),
    });
  } else {
    await storage.updateDeployment(dep.id, { status: "pending" }).catch(() => {});
  }
  _deployIdByAgent[agentName] = dep.id;
  return dep.id;
}

// ─── Public helpers ──────────────────────────────────────────────────────────
export async function getOtcFulfillmentAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    await ensureOtcFulfillmentAgents();
    const results: Record<string, object> = {};
    for (const def of OTC_FULFILLMENT_AGENT_DEFS) {
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

export async function resetOtcFulfillmentDemo(_req: Request, res: Response): Promise<void> {
  _setupDone = false;
  Object.keys(_agentIdByName).forEach(k => delete _agentIdByName[k]);
  Object.keys(_deployIdByAgent).forEach(k => delete _deployIdByAgent[k]);
  res.json({ reset: true });
}

// ─── SSE Live-Run Handler ────────────────────────────────────────────────────
export async function otcFulfillmentLiveRunHandler(req: Request, res: Response): Promise<void> {
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
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepalive); }
  }, 15_000);

  const activeDeployIds = new Set<string>();
  const deployToAgent  = new Map<string, string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted || !activeDeployIds.has(evt.deploymentId)) return;
    const agentName = deployToAgent.get(evt.deploymentId) ?? "unknown";
    const steps: any[] = evt.result?.steps ?? [];
    const toolSteps = steps.filter((s: any) => s.type === "api_call");
    if (toolSteps.length > 0) {
      for (const step of toolSteps) {
        sse("agent_event", {
          agentName,
          type: "tool_call_result",
          tool: step.mcpTool || step.name || "tool",
          data: { tool: step.mcpTool || step.name, success: step.status === "completed" || step.status === "passed" },
        });
      }
    } else {
      sse("agent_event", {
        agentName,
        type: "analysis_step",
        data: { steps: steps.length, success: evt.result?.success },
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepalive);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  const agentResults: Record<string, string> = {};

  try {
    sse("run_start", {
      message: "CRISIS ALERT — Winter Storm Stella affecting Chicago DC, Indianapolis DC, St. Louis DC. 847 shipments at risk. Initiating Fulfillment Exception Command Center…",
      scenario: "OTC-SCN-003",
      event:    "DSRP-2026-WS-0312",
    });

    sse("setup", { message: "Provisioning OTC-AGT-005, OTC-AGT-007, OTC-AGT-012…" });
    await ensureOtcFulfillmentAgents();

    const ids = {
      agt005: _agentIdByName[OTC_AGT_005_NAME],
      agt007: _agentIdByName[OTC_AGT_007_NAME],
      agt012: _agentIdByName[OTC_AGT_012_NAME],
    };

    if (!ids.agt005 || !ids.agt007 || !ids.agt012) {
      sse("error", { message: "One or more agents failed to provision. Check server logs." });
      res.end(); return;
    }

    sse("setup", {
      message: `Agents ready — OTC-AGT-005 ✓ · OTC-AGT-007 ✓ · OTC-AGT-012 ✓`,
      agentIds: ids,
    });

    // ── Sequential pipeline: AGT-005 → AGT-007 → AGT-012 ───────────────────
    for (const step of PIPELINE_STEPS) {
      if (aborted) break;

      const agentId = _agentIdByName[step.agentName];
      if (!agentId) {
        sse("agent_error", { agentName: step.agentName, message: "Agent not found — skipping step" });
        continue;
      }

      const deployId = await _ensureDeployment(agentId, step.agentName);
      activeDeployIds.add(deployId);
      deployToAgent.set(deployId, step.agentName);

      sse("agent_start", {
        agentName:  step.agentName,
        agentCode:  step.agentCode,
        agentId,
        deploymentId: deployId,
        label:      step.label,
        step:       PIPELINE_STEPS.indexOf(step) + 1,
        totalSteps: PIPELINE_STEPS.length,
      });

      const result = await runAgentOnce(deployId, step.taskPrompt, step.maxIter);
      agentResults[step.agentCode] = result.message ?? "";

      activeDeployIds.delete(deployId);

      sse("agent_complete", {
        agentName:   step.agentName,
        agentCode:   step.agentCode,
        agentId,
        deploymentId: deployId,
        success:     result.success,
        summary:     result.message?.slice(0, 400) ?? "",
        step:        PIPELINE_STEPS.indexOf(step) + 1,
      });

      if (!result.success) {
        sse("agent_error", {
          agentName: step.agentName,
          agentCode: step.agentCode,
          message:   `${step.agentCode} failed: ${result.message?.slice(0, 200) ?? "unknown error"} — aborting pipeline`,
        });
        break;
      }
    }

    if (!aborted) {
      sse("pipeline_complete", {
        message:    "Fulfillment Exception Command Center pipeline complete. 312 priority shipments rerouted. 847 customers notified. 93% SLA commitments protected.",
        scenario:   "OTC-SCN-003",
        disruption: "DSRP-2026-WS-0312",
        agentSummaries: agentResults,
        metrics: {
          total_affected:    847,
          priority_rerouted: 312,
          sla_saved_pct:     92.6,
          incremental_cost:  47200,
          customers_notified: 847,
          time_to_response_mins: 8,
        },
      });
    }
  } catch (err: unknown) {
    sse("error", { message: err instanceof Error ? err.message : "Unexpected pipeline error" });
  } finally {
    clearInterval(keepalive);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    try { if (!aborted) res.end(); } catch {}
  }
}
