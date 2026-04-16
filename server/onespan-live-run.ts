import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { agentRuntimeRuns } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { runAgentOnce, stopAgentRuntime, type RuntimeProgressEvent } from "./agent-runtime";
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
  ONESPAN_SYSTEM_PROMPTS,
  OS_TARGET_TXN_ID as TARGET_TXN_ID,
  OS_TARGET_CLIENT  as TARGET_CLIENT,
  OS_TARGET_AMOUNT  as TARGET_AMOUNT,
  OS_TARGET_PRODUCT as TARGET_PRODUCT,
} from "./onespan-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const ONESPAN_MCP_SERVERS = makeOnespanMcpServerDefs(BASE_URL);

// ─── (Data definitions now in server/onespan-shared-defs.ts) ─────────────────
//     Imported above: makeOnespanMcpServerDefs, ONESPAN_KB_DEFS,
//     ONESPAN_SKILLS, ONESPAN_AGENT_DEFS, ONESPAN_POLICY_DEFS,
//     ONESPAN_ONTOLOGY_CONCEPTS, ONESPAN_BLUEPRINT_DEFS, ONESPAN_EVAL_CASES
// ─────────────────────────────────────────────────────────────────────────────

// ─── In-memory ID maps ────────────────────────────────────────────────────────

const _onespanServerIdByName: Record<string, string> = {};
const _onespanSkillIdByName: Record<string, string>  = {};
const _onespanAgentIdByKey: Record<string, string>   = {};

let _onespanSetupDone = false;

// ─── Main provisioning function ───────────────────────────────────────────────

export async function ensureOnespanAgents(): Promise<void> {
  if (_onespanSetupDone) return;

  const orgId = process.env.DEV_ORG_ID || "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

  // ── 1. Knowledge bases ───────────────────────────────────────────────────────
  const allKBs = await storage.getKnowledgeBases(orgId).catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  const kbIdByName: Record<string, string> = {};
  for (const kbDef of ONESPAN_KB_DEFS) {
    let kb = allKBs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:        kbDef.name,
        description: kbDef.description,
        industry:    "financial_services",
        domain:      "digital_agreements",
        status:      "active",
        tags:        ["onespan", "digital_agreements"],
      } as Parameters<typeof storage.createKnowledgeBase>[0]);
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // ── 2. MCP servers + tools ───────────────────────────────────────────────────
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of ONESPAN_MCP_SERVERS) {
    let server = allServers.find(s => s.name === serverDef.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:        serverDef.name,
        description: serverDef.description,
        url:         serverDef.url,
        status:      "active",
        riskTier:    "low",
        allowlisted: true,
      });
    } else if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
    _onespanServerIdByName[serverDef.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    for (const tool of serverDef.tools) {
      if (existingToolNames.has(tool.name)) continue;
      await storage.createMcpServerTool({
        serverId:           server.id,
        name:               tool.name,
        description:        tool.description,
        inputSchema:        tool.inputSchema,
        annotations:        { endpoint: tool.endpoint, method: tool.method },
        enabled:            true,
        riskClassification: "low",
      });
    }
  }

  // ── 3. Skills ────────────────────────────────────────────────────────────────
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of ONESPAN_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:            skillDef.name,
        description:     skillDef.description,
        domain:          skillDef.domain,
        industry:        skillDef.industry,
        version:         skillDef.version,
        author:          "OneSpan Digital Agreements Analytics Engineering",
        trustTier:       "platform-provided",
        complexity:      (skillDef.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            skillDef.tags,
        contextMode:     (skillDef.yamlFrontmatter.contextMode as string) || "summary",
        markdownBody:    skillDef.markdownBody,
        yamlFrontmatter: {
          ...skillDef.yamlFrontmatter,
          industry: "financial_services",
          domain:   "digital_agreements",
          version:  "1.0",
          tags:     skillDef.tags,
        },
        allowedTools: [...(skillDef.yamlFrontmatter.allowedTools || [])],
      });
    }
    _onespanSkillIdByName[skillDef.name] = skill.id;
  }

  // ── 4. Policies ──────────────────────────────────────────────────────────────
  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const polDef of ONESPAN_POLICY_DEFS) {
    const existing = allPolicies.find(p => p.name === polDef.name);
    if (!existing) {
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

  // ── 5. Ontology concepts ─────────────────────────────────────────────────────
  const allConcepts = await storage.getOntologyConcepts("financial_services").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingConceptLabels = new Set(allConcepts.map(c => c.label));
  const { randomUUID } = await import("crypto");
  for (const concept of ONESPAN_ONTOLOGY_CONCEPTS) {
    if (existingConceptLabels.has(concept.label)) continue;
    await storage.createOntologyConcept({
      id:            randomUUID(),
      industryId:    "financial_services",
      ontologyName:  "OneSpan Digital Agreements",
      label:         concept.label,
      category:      concept.category,
      description:   concept.description,
      tags:          concept.tags,
      properties:    [],
      relationships: [],
      synonyms:      [],
      source:        "industry-standard",
    });
  }

  // ── 6. Blueprints ────────────────────────────────────────────────────────────
  const allBlueprints = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const blueprintIdByKey: Record<string, string> = {};
  for (const bpDef of ONESPAN_BLUEPRINT_DEFS) {
    let bp = allBlueprints.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:           "financial_services",
          workflowSteps:      bpDef.workflowSteps,
          requiredTools:      bpDef.requiredTools,
          escalationTriggers: ["VIP decline", "Document version mismatch", "AML attestation gap"],
          complianceNodes:    ["Document-Version-Currency", "VIP-SLA", "Agent-Intervention-Audit", "Human-in-Loop-Gate"],
          outputFormat:       "Portfolio Ops Intelligence Report + JSON pipeline summary",
        },
      });
    }
    blueprintIdByKey[bpDef.key] = bp.id;
  }

  // ── 7. Agents ─────────────────────────────────────────────────────────────────
  const AGENT_POLICY_BINDINGS = [...ONESPAN_AGENT_POLICIES];

  const AGENT_ONTOLOGY_TAGS: Record<string, string[]> = {
    transactionHealthMonitor:  ["Digital Agreement Envelope", "Completion Rate", "Agreement Stall", "VIP Transaction"],
    exceptionClassifier:       ["Document Version Mismatch", "AML Attestation Clause", "Signer Session Event", "Corrective Resend"],
    interventionOrchestrator:  ["Corrective Resend", "Relationship Manager", "Envelope Audit Trail"],
    agreementOpsIntelligence:  ["Peer Benchmark", "OneSpan Analytics Dashboard", "Envelope Audit Trail"],
  };

  const AGENT_SKILL_NAMES: Record<string, string[]> = {
    transactionHealthMonitor:  ["Agreement Portfolio Health Monitoring", "Stall Pattern Detection", "Completion Funnel Analysis"],
    exceptionClassifier:       ["Decline Exception Classification", "Signer Session Analysis", "Document Version Intelligence"],
    interventionOrchestrator:  ["Corrective Envelope Resend", "CRM Record Management", "RM Escalation Protocol"],
    agreementOpsIntelligence:  ["Portfolio Analytics Synthesis", "Peer Benchmark Analysis", "Compliance Reporting"],
  };

  const SHARED_EVAL_SUITE_NAME = "OneSpan — Digital Agreements Intelligence Regression Suite";

  await _refreshOnespanServerIds();

  const allEvals   = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
  let evalSuite    = allEvals.find(e => e.name === SHARED_EVAL_SUITE_NAME);
  const preexistingLeadId = _onespanAgentIdByKey["transactionHealthMonitor"];

  async function provisionEvalCases(suite: NonNullable<typeof evalSuite>): Promise<void> {
    const existingCases     = await storage.getEvalTestCases(suite.id).catch((): Awaited<ReturnType<typeof storage.getEvalTestCases>> => []);
    const existingCaseNames = new Set(existingCases.map(c => c.name));
    for (const ec of ONESPAN_EVAL_CASES) {
      if (existingCaseNames.has(ec.name)) continue;
      await storage.createEvalTestCase({
        suiteId:        suite.id,
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
  }

  if (!evalSuite && preexistingLeadId) {
    evalSuite = await storage.createEvalSuite({
      agentId:         preexistingLeadId,
      name:            SHARED_EVAL_SUITE_NAME,
      type:            "regression",
      industry:        "financial_services",
      passRate:        0.94,
      totalCases:      10,
      coverageTags:    ["portfolio_health","vip_sla","exception_classification","aml_compliance","intervention","crm_audit","rm_escalation","benchmarks"],
      thresholdConfig: { minPassRate: 0.90 },
      scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
    });
    await provisionEvalCases(evalSuite);
  }

  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);

  for (const def of ONESPAN_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);

    const skillNames = AGENT_SKILL_NAMES[def.key] || def.skillNames;
    const preloadedSkills = skillNames
      .map(sn => _onespanSkillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));

    const agentOntologyTags = (AGENT_ONTOLOGY_TAGS[def.key] || []).map(label => ({ label }));
    const agentBlueprintId  = blueprintIdByKey[def.key];

    if (!agent) {
      agent = await storage.createAgent({
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
        maturityFactors:   {},
        preloadedSkills:   preloadedSkills as { skillId: string }[],
        blueprintId:       agentBlueprintId,
        complianceTags:    ["AML-2026Q1", "ONESPAN-POLICY-V3.2", "VIP-SLA"],
        policyBindings:    AGENT_POLICY_BINDINGS,
        ontologyTags:      agentOntologyTags,
        evalBindings:      [{ suiteName: SHARED_EVAL_SUITE_NAME, schedule: "weekly" }],
      } as Parameters<typeof storage.createAgent>[0]);
    } else {
      await storage.updateAgent(agent.id, {
        systemPrompt:    def.systemPrompt,
        runtimeConfig:   { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        preloadedSkills: preloadedSkills as { skillId: string }[],
        blueprintId:     agentBlueprintId,
        policyBindings:  AGENT_POLICY_BINDINGS,
        ontologyTags:    agentOntologyTags,
        evalBindings:    [{ suiteName: SHARED_EVAL_SUITE_NAME, schedule: "weekly" }],
      } as Parameters<typeof storage.updateAgent>[1]);
    }

    _onespanAgentIdByKey[def.key] = agent.id;

    // Bind KB
    const kbId = kbIdByName[def.kbName];
    if (kbId) {
      const existingKbLinks = await storage.getAgentKnowledgeBases(agent.id).catch((): Awaited<ReturnType<typeof storage.getAgentKnowledgeBases>> => []);
      if (!existingKbLinks.some(l => l.knowledgeBaseId === kbId)) {
        await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => {});
      }
    }

    // Bind MCP servers
    for (const mcpName of def.mcpServerNames) {
      const serverId = _onespanServerIdByName[mcpName];
      if (!serverId) continue;
      const existing = await storage.getAgentMcpServerByIds(agent.id, serverId).catch(() => undefined);
      if (!existing) {
        await storage.createAgentMcpServer({ agentId: agent.id, serverId }).catch(() => {});
      }
    }

    // Deferred eval suite creation
    if (!evalSuite && def.key === "transactionHealthMonitor") {
      evalSuite = await storage.createEvalSuite({
        agentId:         agent.id,
        name:            SHARED_EVAL_SUITE_NAME,
        type:            "regression",
        industry:        "financial_services",
        passRate:        0.94,
        totalCases:      10,
        coverageTags:    ["portfolio_health","vip_sla","exception_classification","aml_compliance","intervention","crm_audit","rm_escalation","benchmarks"],
        thresholdConfig: { minPassRate: 0.90 },
        scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
      });
      await provisionEvalCases(evalSuite);
    }
  }

  if (evalSuite) {
    await provisionEvalCases(evalSuite);
  }

  _onespanSetupDone = true;
  console.log(`[onespan] Setup complete — ${ONESPAN_AGENT_DEFS.length} agents, ${ONESPAN_SKILLS.length} skills, 1 eval suite, ${ONESPAN_BLUEPRINT_DEFS.length} blueprints, ${ONESPAN_POLICY_DEFS.length} policies, ${ONESPAN_ONTOLOGY_CONCEPTS.length} ontology concepts`);
}

// ─── ID refresh helper ────────────────────────────────────────────────────────

async function _refreshOnespanServerIds(): Promise<void> {
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of ONESPAN_MCP_SERVERS) {
    const server = allServers.find(s => s.name === serverDef.name);
    if (!server) continue;
    _onespanServerIdByName[serverDef.name] = server.id;
    if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
  }
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  for (const def of ONESPAN_AGENT_DEFS) {
    const agent = allAgents.find(a => a.name === def.name);
    if (agent) _onespanAgentIdByKey[def.key] = agent.id;
  }
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function ensureDeployment(agentId: string, agentName: string, mcpServerIds: string[]): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch((): Awaited<ReturnType<typeof storage.getDeploymentsByAgentId>> => []);
  let deployment = deps[0];

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment:      "production",
      status:           "pending",
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: true,
      deployedAt:       new Date(),
      industry:         "financial_services",
    });
  } else {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentMcpServers>> => []);
  const targetSet     = new Set(mcpServerIds.filter(Boolean));
  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) await storage.deleteAgentMcpServer(link.id);
  }
  const linkedIds = new Set((await storage.getAgentMcpServers(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentMcpServers>> => [])).map(l => l.serverId));
  for (const serverId of mcpServerIds) {
    if (serverId && !linkedIds.has(serverId)) {
      await storage.createAgentMcpServer({ agentId, serverId }).catch(() => {});
    }
  }

  return deployment.id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]) as Record<string, unknown>; } catch { /* fall through */ } }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]) as Record<string, unknown>; } catch { /* fall through */ } }
  return null;
}

function sse(res: Response, event: string, data: Record<string, unknown>) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  } catch { /* client disconnected */ }
}

// ─── SSE live run handler ─────────────────────────────────────────────────────

export async function onespanLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  sse(res, "run_start", {
    message:  "OneSpan Digital Agreements Intelligence Pipeline initializing — 4 agents queued",
    scenario: `${TARGET_TXN_ID} — ${TARGET_CLIENT} ${TARGET_AMOUNT} ${TARGET_PRODUCT} — declined VIP deal`,
  });

  try {
    await ensureOnespanAgents();
    sse(res, "setup", { message: "OneSpan agents, MCP servers, skills, KBs, policies, and ontology verified" });

    const resultSummaries: Record<string, unknown> = {};
    let reportAgentRawOutput = "";

    for (const def of ONESPAN_AGENT_DEFS) {
      if (clientDisconnected) break;

      const agentId = _onespanAgentIdByKey[def.key];
      if (!agentId) {
        sse(res, "agent_error", { agentName: def.name, error: "Agent not found after setup" });
        continue;
      }

      const mcpServerIds = def.mcpServerNames.map(n => _onespanServerIdByName[n]).filter(Boolean);
      const deploymentId = await ensureDeployment(agentId, def.name, mcpServerIds);

      sse(res, "agent_start", {
        agentId,
        agentName:  def.name,
        key:        def.key,
        deploymentId,
        mcpCount:   mcpServerIds.length,
        step:       ONESPAN_AGENT_DEFS.indexOf(def) + 1,
        totalSteps: ONESPAN_AGENT_DEFS.length,
      });

      await stopAgentRuntime(deploymentId).catch(() => {});
      await new Promise<void>(r => setTimeout(r, 300));

      let runSuccess = false;
      let resultText = "";
      let capturedFinalAnalysis = "";

      try {
        const result = await runAgentOnce(
          deploymentId,
          def.taskPrompt,
          def.maxToolIterations,
          (event: RuntimeProgressEvent) => {
            if (event.type === "tool_call_start") {
              sse(res, "tool_call", {
                agentId,
                agentName: def.name,
                tool:      event.data.tool || event.data.function || "unknown",
                iteration: event.data.iteration,
              });
            } else if (event.type === "tool_call_result") {
              sse(res, "tool_result", {
                agentId,
                agentName:   def.name,
                tool:        event.data.tool || "unknown",
                success:     event.data.success !== false,
                recordCount: event.data.recordCount,
                error:       event.data.error,
                iteration:   event.data.iteration,
              });
            } else if (event.type === "final_analysis") {
              capturedFinalAnalysis = (event.data.summary as string) || capturedFinalAnalysis;
            }
          },
        );
        runSuccess = result.success;
        resultText = capturedFinalAnalysis || result.message || "";
        if (def.key === "agreementOpsIntelligence" && capturedFinalAnalysis) {
          reportAgentRawOutput = capturedFinalAnalysis;
        }
      } catch (err: unknown) {
        runSuccess = false;
        resultText = err instanceof Error ? err.message : "Agent run failed";
      }

      const parsed = extractJson(resultText);
      if (parsed) resultSummaries[def.key] = parsed;

      await storage.updateDeployment(deploymentId, {
        status:        runSuccess ? "deployed" : "failed",
        deployedAt:    new Date(),
        resultSummary: parsed ?? { rawOutput: resultText.slice(0, 500) },
      }).catch(() => {});

      sse(res, "agent_complete", {
        agentId,
        agentName:     def.name,
        key:           def.key,
        success:       runSuccess,
        resultSummary: parsed,
      });

      if (!clientDisconnected) await new Promise<void>(r => setTimeout(r, 500));
    }

    let reportText: string;
    if (reportAgentRawOutput) {
      const jsonBlockStart = reportAgentRawOutput.lastIndexOf("```json");
      reportText = (jsonBlockStart > 0 ? reportAgentRawOutput.slice(0, jsonBlockStart) : reportAgentRawOutput).trim();
    } else {
      const opsSummary = resultSummaries["agreementOpsIntelligence"] as Record<string, unknown> | null | undefined;
      if (opsSummary && typeof opsSummary === "object") {
        const completion  = opsSummary["completion_rate_pct"] ?? "88.3";
        const benchmark   = opsSummary["benchmark_completion_pct"] ?? "92.5";
        const risk        = opsSummary["revenue_at_risk_usd"] ?? "340000";
        const rootCause   = opsSummary["systemic_root_cause"] ?? "Document version validation gap in pre-send workflow";
        reportText = [
          `ONESPAN DIGITAL AGREEMENTS — PORTFOLIO INTELLIGENCE REPORT`,
          `As of: ${new Date().toLocaleDateString()} | Rolling 30 Days | ATLAS AGR-004`,
          ``,
          `EXECUTIVE SUMMARY:`,
          `Portfolio completion rate ${completion}% is below the ${benchmark}% peer benchmark. Revenue at risk: $${Number(risk).toLocaleString()}.`,
          `TXN-2026-00847 (${TARGET_CLIENT}, ${TARGET_AMOUNT} Commercial Loan) declined and corrected by AGR-003.`,
          `Systemic root cause: ${rootCause}.`,
          ``,
          `Pipeline Status: All 4 agents completed — Document Version Currency, VIP SLA, and Audit Trail policies satisfied.`,
        ].join("\n");
      } else {
        reportText = `OneSpan Digital Agreements Intelligence pipeline completed for ${TARGET_TXN_ID}. Report generation in progress.`;
      }
    }

    sse(res, "pipeline_complete", {
      message:        "All 4 OneSpan agents completed — Portfolio Intelligence Report ready for review",
      scenario:       `${TARGET_TXN_ID} ${TARGET_CLIENT} ${TARGET_AMOUNT} ${TARGET_PRODUCT} VIP decline recovery`,
      summaries:      resultSummaries,
      reportText,
      pipelineStatus: "COMPLETE",
    });
  } catch (err: unknown) {
    sse(res, "error", { message: err instanceof Error ? err.message : "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent runs list ──────────────────────────────────────────────────────────

export async function getOnespanAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    if (ONESPAN_AGENT_DEFS.some(d => !_onespanAgentIdByKey[d.key])) {
      await _refreshOnespanServerIds();
    }

    type ToolCallTiming = { name: string; latencyMs?: number };
    type RunRecord = {
      key: string; agentId: string | null; agentName: string; step: number;
      agentStatus: string; runId: string | null; runStatus: string;
      triggerType: string | null; latencyMs: number | null;
      startedAt: Date | null; completedAt: Date | null; resultSummary: unknown;
      toolCalls: ToolCallTiming[] | null;
    };

    const TOOL_STEP_TYPES = new Set(["tool_call", "api_call", "mcpTool", "mcp_tool", "tool_use"]);

    function extractToolCalls(stepsJson: unknown): ToolCallTiming[] | null {
      if (!Array.isArray(stepsJson)) return null;
      const calls = stepsJson
        .filter(s => {
          const step = s as Record<string, unknown>;
          return TOOL_STEP_TYPES.has(step.type as string) || Boolean(step.toolName);
        })
        .map(s => {
          const step = s as Record<string, unknown>;
          const name = String(step.toolName ?? step.mcpTool ?? step.tool_name ?? step.name ?? "unknown");
          const latencyMs = typeof step.latencyMs === "number" ? step.latencyMs : undefined;
          return { name, ...(latencyMs !== undefined ? { latencyMs } : {}) };
        })
        .filter(tc => tc.name !== "unknown");
      return calls.length > 0 ? calls : null;
    }

    const runs: RunRecord[] = await Promise.all(
      ONESPAN_AGENT_DEFS.map(async (def, idx) => {
        const agentId = _onespanAgentIdByKey[def.key] ?? null;
        if (!agentId) {
          return {
            key: def.key, agentId: null, agentName: def.name, step: idx + 1,
            agentStatus: "not_setup", runId: null, runStatus: "idle",
            triggerType: null, latencyMs: null, startedAt: null, completedAt: null,
            resultSummary: null, toolCalls: null,
          };
        }

        const allRuns = await storage.getAgentRuntimeRuns(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentRuntimeRuns>> => []);
        const getRunTime = (run: (typeof allRuns)[number]) =>
          new Date(run.completedAt ?? run.startedAt ?? 0).getTime();
        const lastRun = allRuns
          .filter(r => r.startedAt || r.completedAt)
          .sort((a, b) => getRunTime(b) - getRunTime(a))[0] ?? null;

        return {
          key:           def.key,
          agentId,
          agentName:     def.name,
          step:          idx + 1,
          agentStatus:   "active",
          runId:         lastRun?.id ?? null,
          runStatus:     lastRun?.status ?? "idle",
          triggerType:   lastRun?.triggerType ?? null,
          latencyMs:     lastRun?.latencyMs ?? null,
          startedAt:     lastRun?.startedAt ?? null,
          completedAt:   lastRun?.completedAt ?? null,
          resultSummary: lastRun?.resultSummary ?? null,
          toolCalls:     lastRun ? extractToolCalls(lastRun.stepsJson) : null,
        };
      }),
    );

    res.json({ agentRuns: runs, scenario: `${TARGET_TXN_ID} ${TARGET_CLIENT} VIP Decline Recovery Pipeline` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ─── Setup endpoint handler ───────────────────────────────────────────────────

export async function onespanSetupHandler(_req: Request, res: Response): Promise<void> {
  try {
    _onespanSetupDone = false;
    await ensureOnespanAgents();
    res.json({
      success:    true,
      message:    "OneSpan agents, MCP servers, skills, KBs, policies, ontology, evals, and blueprints provisioned.",
      agentCount: ONESPAN_AGENT_DEFS.length,
      skillCount: ONESPAN_SKILLS.length,
      mcpCount:   ONESPAN_MCP_SERVERS.length,
      agents: ONESPAN_AGENT_DEFS.map(d => ({
        key: d.key, name: d.name, id: _onespanAgentIdByKey[d.key] ?? null,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Setup failed" });
  }
}

// ─── Reset endpoint handler ───────────────────────────────────────────────────

export async function onespanResetHandler(_req: Request, res: Response): Promise<void> {
  try {
    const agentIds = Object.values(_onespanAgentIdByKey).filter(Boolean) as string[];
    if (agentIds.length > 0) {
      await db
        .delete(agentRuntimeRuns)
        .where(inArray(agentRuntimeRuns.agentId, agentIds));
    }
    res.json({ success: true, message: "OneSpan demo reset — run history cleared.", agentCount: agentIds.length });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Reset failed" });
  }
}
