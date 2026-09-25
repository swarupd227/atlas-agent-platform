import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { isKnownIndustry } from "@shared/industry-filter";
import { resolveReadableSkills, skillCatalogPrompt } from "../builtin-skill-tools";
import { db } from "../db";
import { ensureAarConfig } from "./aar";
import { desc, and, eq, gte, sql } from "drizzle-orm";
import { agentMcpServers, agents as agentsTable, runTraces, traceSpans } from "@shared/schema";
import { z, ZodError } from "zod";
import {
  insertAgentSchema,
  updateAgentSchema,
  insertRunTraceSchema,
  insertDeploymentSchema,
  insertEvalSuiteSchema,
  insertAgentTemplateSchema,
  insertEvalTestCaseSchema,
  insertEvalRunSchema,
  insertEvalCaseResultSchema,
} from "@shared/schema";
import {
  checkPermission,
  getRequestRole,
  getRequestActorLabel,
  hasPermission,
  getTraceRedactionLevel,
  getRedactionLevel,
  redactPayload,
  redactWithOntologyKeys,
} from "../permissions";
import { RemovalPlanError, planAgentRemoval } from "../removal-plans";
import { getOrgId, getDefaultOrgId } from "../auth";
import { resolveRequestOrgId, filterEvalSuitesForOrg, filterEvalRunsForOrg } from "../tenant-scope";
import { buildBlastRadius } from "../blast-radius";
import {
  resolveOntologyTags,
  generateKpiAlignedEvalSuite,
  buildAgentSystemPrompt,
  handleZodError,
  recomputeOutcomeKpis,
  computeConstraintGraph,
  generateOntologyEvalCases,
  resolvePolicyBundle,
  resolveGovernancePromptEntries,
  renderGovernanceBlock,
} from "./helpers";
import * as nodeCrypto from "crypto";
import { changeRoutingAction, checkDeploymentFreeze, createDeploymentAction, promoteDeploymentAction, rollbackDeploymentAction } from "../deployment-actions";
import {
  startAgentRuntime,
  stopAgentRuntime,
  runAgentOnce,
  isRuntimeActive,
  checkOntologyCompliance,
  canonicalJsonStringify,
} from "../agent-runtime";
import { callClaude, stripJsonFences } from "../claude";

const router = Router();

  router.get("/api/agents", async (req, res) => {
    // ?summary=1: only what a list shows. A full row carries ~80 columns and 12
    // JSON blobs (blueprint, runtime config, system prompt), and four pages ask
    // for the whole list.
    const orgId = getOrgId(req);
    res.json(req.query.summary === "1" ? await storage.getAgentSummaries(orgId) : await storage.getAgents(orgId));
  });

  /**
   * What each agent has actually done, counted from its runs: runs in the
   * last 30 days, how many failed, and when it last ran. The agents table's
   * own totalRuns / successRate / healthScore columns are seed data (one
   * agent claims 18,432 runs) and no runtime path updates them, so nothing
   * reads them.
   *
   * Registered before /api/agents/:id, which would otherwise match "activity".
   */
  router.get("/api/agents/activity", async (req, res) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    if (!orgId) return res.json({ days: 30, agents: {} });
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [runs, connectors] = await Promise.all([
      db
        .select({
          agentId: runTraces.agentId,
          runs: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where ${runTraces.status} <> 'completed')::int`,
          lastRunAt: sql<string | null>`max(${runTraces.startedAt})`,
        })
        .from(runTraces)
        .where(and(eq(runTraces.organizationId, orgId), gte(runTraces.startedAt, since)))
        .groupBy(runTraces.agentId),
      db
        .select({ agentId: agentMcpServers.agentId, connectors: sql<number>`count(*)::int` })
        .from(agentMcpServers)
        .innerJoin(agentsTable, eq(agentsTable.id, agentMcpServers.agentId))
        .where(eq(agentsTable.organizationId, orgId))
        .groupBy(agentMcpServers.agentId),
    ]);
    const byAgent: Record<string, { runs: number; failed: number; lastRunAt: string | null; connectors: number }> = {};
    for (const r of runs) byAgent[r.agentId] = { runs: r.runs, failed: r.failed, lastRunAt: r.lastRunAt, connectors: 0 };
    for (const c of connectors) {
      byAgent[c.agentId] = byAgent[c.agentId] ?? { runs: 0, failed: 0, lastRunAt: null, connectors: 0 };
      byAgent[c.agentId].connectors = c.connectors;
    }
    res.json({ days: 30, agents: byAgent });
  });

  router.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id, getOrgId(req));
    if (!agent) return res.status(404).json({ message: "Not found" });
    res.json(agent);
  });

  router.post("/api/agents", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.blueprintId) {
        const bp = await storage.getBlueprint(body.blueprintId);
        if (!bp) {
          return res.status(400).json({ message: `Blueprint not found: ${body.blueprintId}` });
        }
        if (bp.blueprintJson) {
          body.blueprintJson = bp.blueprintJson;
        }
      }
      const data = insertAgentSchema.omit({ organizationId: true }).parse(body);
      const agent = await storage.createAgent({ ...data, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });

      const sourceTemplateId = req.body.sourceTemplateId || (agent.runtimeConfig as any)?.sourceTemplateId;
      if (sourceTemplateId) {
        await storage.incrementTemplateUsage(sourceTemplateId);
      }

      // Fix #1: Auto-create a blueprint record when blueprintJson provided but no blueprintId
      // This ensures startAgentRuntime can resolve blueprint requirements via getBlueprintsByAgent
      if (!data.blueprintId && agent.blueprintJson) {
        try {
          const bp = await storage.createBlueprint({
            name: `${agent.name} Blueprint`,
            agentId: agent.id,
            status: "draft",
            blueprintJson: agent.blueprintJson,
          });
          await storage.updateAgent(agent.id, { blueprintId: bp.id });
        } catch (_) {}
      }

      // Fix #2: Auto-create MCP server link records from explicit IDs or server names
      const mcpServerIds: string[] = Array.isArray(req.body.mcpServerIds) ? req.body.mcpServerIds : [];
      const mcpServerNames: string[] = Array.isArray(req.body.mcpServerNames) ? req.body.mcpServerNames : [];
      if (mcpServerIds.length > 0 || mcpServerNames.length > 0) {
        try {
          // Names resolve only among this tenant's connectors, never to another org's row.
          const allServers = mcpServerNames.length > 0 ? await storage.getMcpServers(getOrgId(req) ?? getDefaultOrgId()) : [];
          for (const serverId of mcpServerIds) {
            const existing = await storage.getAgentMcpServerByIds(agent.id, serverId);
            if (!existing) await storage.createAgentMcpServer({ agentId: agent.id, serverId });
          }
          for (const name of mcpServerNames) {
            const matched = allServers.find(s =>
              s.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(s.name.toLowerCase())
            );
            if (matched) {
              const existing = await storage.getAgentMcpServerByIds(agent.id, matched.id);
              if (!existing) await storage.createAgentMcpServer({ agentId: agent.id, serverId: matched.id });
            }
          }
        } catch (_) {}
      }

      // Fix #3: Auto-create KB link records from explicit IDs or KB names
      const knowledgeBaseIds: string[] = Array.isArray(req.body.knowledgeBaseIds) ? req.body.knowledgeBaseIds : [];
      const knowledgeBaseNames: string[] = Array.isArray(req.body.knowledgeBaseNames) ? req.body.knowledgeBaseNames : [];
      if (knowledgeBaseIds.length > 0 || knowledgeBaseNames.length > 0) {
        try {
          const allKbs = knowledgeBaseNames.length > 0 ? await storage.getKnowledgeBases() : [];
          for (const knowledgeBaseId of knowledgeBaseIds) {
            await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId });
          }
          for (const name of knowledgeBaseNames) {
            const matched = allKbs.find(k =>
              k.name?.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.name?.toLowerCase() || "")
            );
            if (matched) await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: matched.id });
          }
        } catch (_) {}
      }

      // Fix #4: Auto-bind KPIs from linked outcome into runtimeConfig.kpiBindings
      if (agent.outcomeId) {
        try {
          const kpis = await storage.getKpisByOutcome(agent.outcomeId);
          if (kpis.length > 0) {
            const existingRt = (agent.runtimeConfig as Record<string, any>) || {};
            if (!Array.isArray(existingRt.kpiBindings) || existingRt.kpiBindings.length === 0) {
              const kpiBindings = kpis.map(k => ({ kpiId: k.id, kpiName: k.name, target: (k as any).target || null }));
              await storage.updateAgent(agent.id, { runtimeConfig: { ...existingRt, kpiBindings } });
            }
          }
        } catch (_) {}
      }

      // Fix #5: Inherit outcome-scoped policies into policyBindings so bound governance applies at runtime
      if (agent.outcomeId) {
        try {
          const outcomePolicies = await storage.getPoliciesByScope("outcome", agent.outcomeId);
          if (outcomePolicies.length > 0) {
            const existing = (agent.policyBindings as any) || {};
            const existingNames: string[] = Array.isArray(existing.policies) ? existing.policies : [];
            const newNames = outcomePolicies.map(p => p.name).filter(n => !existingNames.includes(n));
            if (newNames.length > 0) {
              await storage.updateAgent(agent.id, {
                policyBindings: {
                  ...existing,
                  policies: [...existingNames, ...newNames],
                  outcomeBindings: outcomePolicies.map(p => ({ policyId: p.id, policyName: p.name, domain: p.domain })),
                },
              });
            }
          }
        } catch (_) {}
      }

      const hasMemGovRules = Array.isArray(req.body.memoryGovernanceRules) && req.body.memoryGovernanceRules.length > 0;
      const hasRegulatedTags = Array.isArray(agent.complianceTags) && agent.complianceTags.some((t: string) => ["HIPAA", "PCI-DSS", "SOX", "GDPR", "BSA", "AML", "NAIC", "PCI"].includes(t.toUpperCase()));
      if (hasMemGovRules || hasRegulatedTags) {
        const getIndustryFromRules = (agent: any): string => {
          const tags: string[] = [];
          if (Array.isArray(agent.complianceTags)) tags.push(...agent.complianceTags);
          if (Array.isArray(agent.ontologyTags)) {
            for (const t of agent.ontologyTags) {
              if (typeof t === "string") tags.push(t);
              else if (t && typeof t === "object" && t.conceptLabel) tags.push(t.conceptLabel);
              else if (t && typeof t === "object" && t.conceptId) tags.push(t.conceptId);
            }
          }
          const combined = tags.join(" ").toUpperCase();
          if (combined.includes("HIPAA")) return "healthcare";
          if (combined.includes("BSA") || combined.includes("AML") || combined.includes("SOX") || combined.includes("CIP")) return "financial_services";
          if (combined.includes("NAIC")) return "insurance";
          if (combined.includes("PCI-DSS") || combined.includes("PCI")) return "retail";
          return "general";
        };

        const industry = getIndustryFromRules(agent);

        const INDUSTRY_TIER_CONFIGS: Record<string, any> = {
          healthcare: {
            working: { retentionDays: 1, encrypted: true, accessControl: "Role-based" },
            episodic: { retentionDays: 2190, encrypted: true, accessControl: "Minimum necessary" },
            semantic: { retentionDays: -1, encrypted: true, accessControl: "Role-based" },
          },
          financial_services: {
            working: { retentionDays: 1, encrypted: true, accessControl: "Need-to-know" },
            episodic: { retentionDays: 1825, encrypted: true, accessControl: "Audit-logged" },
            semantic: { retentionDays: -1, encrypted: true, accessControl: "Segregated" },
          },
          insurance: {
            working: { retentionDays: 1, encrypted: true, accessControl: "Role-based" },
            episodic: { retentionDays: 2555, encrypted: true, accessControl: "Claims-restricted" },
            semantic: { retentionDays: -1, encrypted: true, accessControl: "Underwriter-only" },
          },
        };
        const defaultTierConfig = {
          working: { retentionDays: 1, encrypted: false, accessControl: "Standard" },
          episodic: { retentionDays: 90, encrypted: false, accessControl: "Standard" },
          semantic: { retentionDays: -1, encrypted: false, accessControl: "Standard" },
        };
        const tierConfigs = INDUSTRY_TIER_CONFIGS[industry] || defaultTierConfig;

        const combinedUpper = [
          ...(Array.isArray(agent.complianceTags) ? agent.complianceTags : []),
          ...(Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as any[]).map((t: any) => typeof t === "string" ? t : (t?.conceptLabel || t?.conceptId || "")) : []),
        ].join(" ").toUpperCase();

        let forgettingPolicies: any[];
        if (combinedUpper.includes("HIPAA")) {
          forgettingPolicies = [
            { trigger: "retention_expiry", action: "archive", afterDays: 2190 },
            { trigger: "gdpr_erasure", action: "anonymize", afterDays: 30 },
          ];
        } else if (combinedUpper.includes("PCI")) {
          forgettingPolicies = [
            { trigger: "session_end", action: "delete", afterDays: 0 },
            { trigger: "retention_expiry", action: "delete", afterDays: 365 },
          ];
        } else if (industry === "financial_services") {
          forgettingPolicies = [
            { trigger: "retention_expiry", action: "archive", afterDays: 1825 },
            { trigger: "gdpr_erasure", action: "anonymize", afterDays: 30 },
          ];
        } else {
          forgettingPolicies = [
            { trigger: "retention_expiry", action: "delete", afterDays: 90 },
          ];
        }

        try {
          await storage.createMemoryProfile({
            name: agent.name + " Memory Profile",
            industry,
            agentId: agent.id,
            tierConfigs,
            industryRules: hasMemGovRules ? req.body.memoryGovernanceRules : [],
            forgettingPolicies,
            status: "active",
          });
          console.log("[memory-profile] Auto-created for agent", agent.name, "industry:", industry);
        } catch (mpErr) {
          console.error("[memory-profile] Failed to auto-create:", mpErr);
        }
      }

      const tools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig as Array<{ name?: string; description?: string }> : [];
      const bp = agent.blueprintJson && typeof agent.blueprintJson === "object" ? agent.blueprintJson as Record<string, unknown> : {};
      const workflow = (
        Array.isArray(bp.nodes) ? bp.nodes :
        Array.isArray(bp.workflowNodes) ? bp.workflowNodes : []
      ) as Array<{ id?: string; type?: string; label?: string }>;

      const testCases: Array<{ name: string; inputData: unknown; expectedOutput: unknown; tags: string[] }> = [];

      const oTags = Array.isArray(agent.ontologyTags) ? agent.ontologyTags as string[] : [];
      const domainPrefix = oTags.length > 0 ? oTags[0] : (agent.industryId || agent.name);
      const domainTags = oTags.length > 0 ? oTags.slice(0, 3) : [];

      testCases.push({
        name: `${domainPrefix} Latency Check`,
        inputData: { type: "latency_probe", payload: "standard_input", domain: domainPrefix },
        expectedOutput: { maxLatencyMs: 5000, status: "pass" },
        tags: ["baseline", "latency", ...domainTags],
      });
      testCases.push({
        name: `${domainPrefix} Error Handling - Invalid Input`,
        inputData: { type: "invalid", payload: null, domain: domainPrefix },
        expectedOutput: { status: "graceful_error", errorHandled: true },
        tags: ["error_handling", "robustness", ...domainTags],
      });

      for (const tool of tools.slice(0, 5)) {
        if (tool.name) {
          testCases.push({
            name: `${domainPrefix} Tool Access - ${tool.name}`,
            inputData: { type: "tool_access", tool: tool.name, action: "invoke", domain: domainPrefix },
            expectedOutput: { authorized: true, toolResponds: true },
            tags: ["tool_permission", tool.name, ...domainTags],
          });
        }
      }

      for (const node of workflow.slice(0, 5)) {
        if (node.type === "human_review") {
          testCases.push({
            name: `${domainPrefix} Escalation - ${node.label || node.id}`,
            inputData: { type: "escalation_trigger", nodeId: node.id, domain: domainPrefix },
            expectedOutput: { escalated: true, reviewerNotified: true },
            tags: ["escalation", "human_review", ...domainTags],
          });
        } else if (node.type) {
          testCases.push({
            name: `${domainPrefix} Workflow - ${node.label || node.id || node.type}`,
            inputData: { type: "workflow_step", nodeId: node.id, nodeType: node.type, domain: domainPrefix },
            expectedOutput: { stepCompleted: true },
            tags: ["workflow", node.type, ...domainTags],
          });
        }
      }

      if (agent.memoryRagConfig && typeof agent.memoryRagConfig === "object") {
        testCases.push({
          name: `${domainPrefix} RAG Retrieval Quality`,
          inputData: { type: "retrieval_probe", query: `test ${domainPrefix} retrieval accuracy`, domain: domainPrefix },
          expectedOutput: { relevanceScore: 0.7, documentsReturned: true },
          tags: ["rag", "retrieval", ...domainTags],
        });
      }

      const suite = await storage.createEvalSuite({
        agentId: agent.id,
        name: `${agent.name} - Auto-Generated Suite`,
        type: "regression",
        totalCases: testCases.length,
      });

      for (const tc of testCases) {
        await storage.createEvalTestCase({
          suiteId: suite.id,
          name: tc.name,
          inputData: tc.inputData as Record<string, unknown>,
          expectedOutput: tc.expectedOutput as Record<string, unknown>,
          tags: tc.tags,
          weight: 1,
        });
      }

      const domainAssumptions = [
        { item: "Model capability matches use case complexity", validated: false },
        { item: `${agent.modelProvider}/${agent.modelName} supports required output format`, validated: false },
        ...(tools.length > 0 ? [{ item: `Tools (${tools.map(t => t.name).join(", ")}) have correct API access`, validated: false }] : []),
        ...(agent.memoryRagConfig ? [{ item: "RAG corpus covers target domain knowledge", validated: false }] : []),
      ];

      const regulatoryConstraints = [
        { item: "Data handling complies with privacy policy", validated: false },
        ...(agent.riskTier === "HIGH" ? [{ item: "HIGH risk tier requires enhanced monitoring", validated: false }] : []),
        ...(tools.some((t: any) => (t.name || "").includes("write") || (t.name || "").includes("send") || (t.name || "").includes("delete"))
          ? [{ item: "Write/send/delete tools require explicit authorization controls", validated: false }] : []),
        { item: "Output content meets compliance standards", validated: false },
      ];

      const escalationPaths = [
        { item: `Autonomy mode "${agent.autonomyMode}" has appropriate human oversight`, validated: false },
        ...(workflow.some(n => n.type === "human_review")
          ? [{ item: "Human review nodes are correctly positioned in workflow", validated: false }]
          : [{ item: "No human review node in workflow - confirm autonomous operation is safe", validated: false }]),
        { item: "Rollback plan is defined and tested", validated: agent.rollbackPlan != null },
      ];

      await storage.createApproval({
        type: "blueprint_review",
        objectType: "agent",
        objectId: agent.id,
        objectName: agent.name,
        riskScore: agent.riskTier === "HIGH" ? 0.85 : agent.riskTier === "MEDIUM" ? 0.55 : 0.25,
        status: "pending",
        requestedBy: agent.owner || "system",
        description: `Expert validation required for new agent "${agent.name}" blueprint before deployment`,
        evidenceJson: {
          blueprintSummary: {
            modelProvider: agent.modelProvider,
            modelName: agent.modelName,
            toolCount: tools.length,
            tools: tools.map(t => t.name).filter(Boolean),
            workflowNodeCount: workflow.length,
            workflowNodes: workflow.map(n => ({ type: n.type, label: n.label })),
            hasMemoryRag: !!agent.memoryRagConfig,
            policyBindings: Array.isArray(agent.policyBindings) ? (agent.policyBindings as any[]).length : 0,
            evalSuiteId: suite.id,
            evalTestCaseCount: testCases.length,
          },
          riskTier: agent.riskTier,
          autonomyMode: agent.autonomyMode,
          domainAssumptions,
          regulatoryConstraints,
          escalationPaths,
          validationChecklist: [
            ...domainAssumptions.map(d => ({ ...d, category: "domain" })),
            ...regulatoryConstraints.map(r => ({ ...r, category: "regulatory" })),
            ...escalationPaths.map(e => ({ ...e, category: "escalation" })),
          ],
          // No evalResults/shadowReplayResults/blastRadius here: this approval
          // is created at agent-creation time, before the auto-scaffolded eval
          // suite (created below) has ever run. There is no real "before"
          // version and no real replay/blast-radius data to report yet --
          // fabricating plausible-looking numbers previously misled reviewers
          // into approving against evidence that didn't exist. A reviewer can
          // check the real eval suite (evalSuiteId above) once it has run.
        },
      });

      const agentOntologyTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];
      await storage.createAuditEvent({
        actorType: "system",
        actorId: agent.owner || "system",
        action: "agent_created",
        objectType: "agent",
        objectId: agent.id,
        details: `Agent "${agent.name}" created with auto-scaffolded eval suite (${testCases.length} test cases) and blueprint review approval`,
        ontologyTags: resolveOntologyTags("agent", "agent_created", { agentOntologyTags: agentOntologyTags }),
      });

      const evalJob = await storage.createJob({
        type: "eval_baseline",
        status: "queued",
        agentId: agent.id,
        payload: { agentId: agent.id, suiteId: suite.id, blueprintId: null },
        progress: 0,
      });

      await storage.createAuditEvent({
        actorType: "system",
        actorId: agent.owner || "system",
        action: "eval_baseline_enqueued",
        objectType: "agent",
        objectId: agent.id,
        details: `Baseline eval job ${evalJob.id} auto-enqueued for agent "${agent.name}"`,
        ontologyTags: resolveOntologyTags("agent", "eval_baseline_enqueued", { agentOntologyTags: agentOntologyTags }),
      });

      let kpiSuiteResult = null;
      if (agent.outcomeId) {
        try {
          kpiSuiteResult = await generateKpiAlignedEvalSuite(agent.id, agent.outcomeId, getOrgId(req));
        } catch (kpiErr) {
          console.error("[kpi-eval] KPI-aligned eval suite generation failed:", kpiErr);
        }
      }

      res.status(201).json({
        ...agent,
        suiteId: suite.id,
        jobId: evalJob.id,
        kpiAlignedSuiteId: kpiSuiteResult?.suite?.id || null,
        kpiAlignedTestCases: kpiSuiteResult?.testCases?.length || 0,
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/agents/bulk-action", async (req, res) => {
    try {
      // rotate_secrets and export_audit were removed: neither has a real
      // per-agent mechanism backing it (no secret-rotation vault operation
      // scoped to an agent, no per-agent audit-bundle export) -- they
      // previously only wrote an audit-log sentence and did nothing.
      const bulkActionSchema = z.object({
        action: z.enum(["regression_eval", "freeze_deployments", "delete"]),
        agentIds: z.array(z.string()).min(1),
      });
      const { action, agentIds } = bulkActionSchema.parse(req.body);

      const allAgents = await storage.getAgents(getOrgId(req));
      const targetAgents = allAgents.filter(a => agentIds.includes(a.id));
      const allEvalSuites = action === "regression_eval" ? await storage.getEvalSuites() : [];

      for (const agent of targetAgents) {
        let actionDescription = "";
        if (action === "delete") {
          actionDescription = `Agent "${agent.name}" deleted via bulk action`;
          await storage.deleteAgent(agent.id);
        } else if (action === "regression_eval") {
          const suite = allEvalSuites.find(s => s.agentId === agent.id);
          if (suite) {
            const job = await storage.createJob({
              type: "eval_baseline",
              status: "queued",
              agentId: agent.id,
              payload: { agentId: agent.id, suiteId: suite.id, blueprintId: null },
              progress: 0,
            });
            actionDescription = `Regression eval job ${job.id} enqueued for agent "${agent.name}" (suite ${suite.id})`;
          } else {
            actionDescription = `Regression eval skipped for agent "${agent.name}": no eval suite configured`;
          }
        } else if (action === "freeze_deployments") {
          await storage.createAuditEvent({
            actorType: "user",
            actorId: "ops_user",
            action: "deployment_freeze",
            objectType: "agent",
            objectId: agent.id,
            details: JSON.stringify({ scope: "agent", targetId: agent.id, reason: "Bulk action" }),
          });
          actionDescription = `Deployments frozen for agent "${agent.name}"`;
        }

        const bulkAgentTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];
        await storage.createAuditEvent({
          actorType: "user",
          actorId: "ops_user",
          action: `bulk_${action}`,
          objectType: "agent",
          objectId: agent.id,
          details: actionDescription,
          ontologyTags: resolveOntologyTags("agent", `bulk_${action}`, { agentOntologyTags: bulkAgentTags }),
        });
      }

      res.json({ success: true, processed: targetAgents.length, action });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Bulk action failed" });
    }
  });

  router.post("/api/agents/bulk-create-from-plan", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const schema = z.object({
        outcomeId: z.string(),
        industry: z.string().optional(),
        agents: z.array(z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          agentType: z.enum(["single", "team", "remote"]).optional(),
          riskTier: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
          autonomyMode: z.enum(["manual", "assisted", "autonomous"]).optional(),
          modelProvider: z.string().optional(),
          modelName: z.string().optional(),
          runtimeConfig: z.any().optional(),
          blueprintId: z.string().optional(),
        })).min(1),
      });
      const { outcomeId, industry, agents: agentPlans } = schema.parse(req.body);

      const created = [];
      for (const plan of agentPlans) {
        let blueprintJson: any = null;
        if (plan.blueprintId) {
          const bp = await storage.getBlueprint(plan.blueprintId);
          if (!bp) {
            return res.status(400).json({ message: `Blueprint not found: ${plan.blueprintId}` });
          }
          if (bp.blueprintJson) blueprintJson = bp.blueprintJson;
        }
        const agentData = insertAgentSchema.omit({ organizationId: true }).parse({
          name: plan.name,
          description: plan.description || "",
          agentType: plan.agentType || "single",
          outcomeId,
          riskTier: plan.riskTier || "MEDIUM",
          autonomyMode: plan.autonomyMode || "assisted",
          modelProvider: plan.modelProvider || "openai",
          modelName: plan.modelName || "gpt-4.1",
          // Agents have no "industry" column; a known industry is stored, otherwise the organization's applies.
          industryId: industry && isKnownIndustry(industry) ? industry : undefined,
          runtimeConfig: plan.runtimeConfig || null,
          blueprintId: plan.blueprintId || undefined,
          blueprintJson: blueprintJson || undefined,
          status: "active",
        });
        const agent = await storage.createAgent({ ...agentData, organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined });
        created.push(agent);
      }

      res.json({ agents: created, count: created.length });
    } catch (e: any) {
      handleZodError(res, e);
    }
  });

  router.patch("/api/agents/:id", checkPermission("create_modify_blueprints"), async (req: Request<{ id: string }>, res: Response) => {
    try {
      const existing = await storage.getAgent(req.params.id, getOrgId(req));
      if (!existing) return res.status(404).json({ message: "Agent not found" });

      const patch = updateAgentSchema.parse(req.body);
      const updated = await storage.updateAgent(req.params.id, patch, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Agent not found" });

      const changedFields = Object.keys(patch).filter(k => {
        const oldVal = JSON.stringify((existing as any)[k]);
        const newVal = JSON.stringify((patch as any)[k]);
        return oldVal !== newVal;
      });

      if (changedFields.length > 0) {
        const changeSummary = changedFields.slice(0, 5).join(", ") + (changedFields.length > 5 ? ` +${changedFields.length - 5} more` : "");
        const agentTags = Array.isArray(existing.ontologyTags) ? (existing.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];
        await storage.createAuditEvent({
          actorType: "user",
          actorId: "ops_user",
          action: "agent.config_changed",
          objectType: "agent",
          objectId: existing.id,
          details: JSON.stringify({ summary: `Agent "${existing.name}" configuration updated: ${changeSummary}`, agentName: existing.name, changedFields, outcomeId: existing.outcomeId || null }),
          ontologyTags: resolveOntologyTags("agent", "agent.config_changed", { agentOntologyTags: agentTags }),
        });
      }

      let reEvaluation = null;
      if (updated.outcomeId && changedFields.length > 0) {
        try {
          reEvaluation = await recomputeOutcomeKpis(updated.outcomeId, getOrgId(req));
          const breaches = reEvaluation.changes.filter(c => c.breached);
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "kpi_evaluator",
            action: "kpi.auto_reeval",
            objectType: "outcome",
            objectId: updated.outcomeId,
            details: JSON.stringify({ summary: `Auto re-evaluation triggered by config change on agent "${updated.name}": ${reEvaluation.changes.length} KPI(s) updated${breaches.length > 0 ? `, ${breaches.length} SLA breach(es)` : ""}`, agentName: updated.name, agentId: updated.id, changes: reEvaluation.changes, noChanges: reEvaluation.changes.length === 0 }),
            ontologyTags: resolveOntologyTags("outcome", "kpi.auto_reeval"),
          });
        } catch (reEvalErr) {
          console.error("[kpi-reeval] Auto re-evaluation failed:", reEvalErr);
        }
      }

      let kpiSuiteResult = null;
      const outcomeNewlyBound = updated.outcomeId && (!existing.outcomeId || existing.outcomeId !== updated.outcomeId);
      if (outcomeNewlyBound) {
        try {
          kpiSuiteResult = await generateKpiAlignedEvalSuite(updated.id, updated.outcomeId!, getOrgId(req));
        } catch (kpiErr) {
          console.error("[kpi-eval] KPI-aligned eval suite generation on binding failed:", kpiErr);
        }
      }

      res.json({
        ...updated,
        reEvaluationTriggered: !!reEvaluation,
        kpiReEvaluation: reEvaluation,
        kpiAlignedSuiteId: kpiSuiteResult?.suite?.id || null,
        kpiAlignedTestCases: kpiSuiteResult?.testCases?.length || 0,
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/agents/:id/validate-config", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const proposedChanges = req.body;
      const violations: Array<{ constraint: string; current: string; proposed: string; severity: string }> = [];

      if (!agent.outcomeId) {
        return res.json({ valid: true, violations: [] });
      }

      const outcome = await storage.getOutcome(agent.outcomeId, getOrgId(req));
      if (!outcome) {
        return res.json({ valid: true, violations: [] });
      }

      const kpis = await storage.getKpisByOutcome(agent.outcomeId);
      const constraintGraph = outcome.constraintGraph as any;

      const riskTierOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      if (proposedChanges.riskTier && proposedChanges.riskTier !== agent.riskTier) {
        const outcomeRiskLevel = riskTierOrder[outcome.riskTier] || 2;
        const proposedRiskLevel = riskTierOrder[proposedChanges.riskTier] || 2;
        if (proposedRiskLevel < outcomeRiskLevel) {
          violations.push({
            constraint: `Outcome "${outcome.name}" requires minimum risk tier: ${outcome.riskTier}`,
            current: agent.riskTier,
            proposed: proposedChanges.riskTier,
            severity: "critical",
          });
        }
      }

      if (proposedChanges.autonomyMode && proposedChanges.autonomyMode !== agent.autonomyMode) {
        const autonomyOrder: Record<string, number> = { assisted: 1, supervised: 2, autonomous: 3 };
        const currentLevel = autonomyOrder[agent.autonomyMode] || 1;
        const proposedLevel = autonomyOrder[proposedChanges.autonomyMode] || 1;
        const outcomeRiskLevel = riskTierOrder[outcome.riskTier] || 2;
        if (proposedLevel > currentLevel && outcomeRiskLevel >= 3) {
          violations.push({
            constraint: `Outcome "${outcome.name}" has ${outcome.riskTier} risk tier — increasing autonomy requires review`,
            current: agent.autonomyMode,
            proposed: proposedChanges.autonomyMode,
            severity: "warning",
          });
        }
      }

      if (proposedChanges.modelName && proposedChanges.modelName !== agent.modelName) {
        const highAccuracyKpis = kpis.filter(k => {
          const name = (k.name || "").toLowerCase();
          return (name.includes("accuracy") || name.includes("success") || name.includes("rate")) && k.slaThreshold && k.slaThreshold >= 99;
        });
        if (highAccuracyKpis.length > 0) {
          const currentModel = (agent.modelName || "").toLowerCase();
          const proposedModel = (proposedChanges.modelName || "").toLowerCase();
          const premiumModels = ["gpt-4.1", "gpt-4o", "gpt-4", "claude-3-opus", "claude-3.5-sonnet"];
          const isPremiumCurrent = premiumModels.some(m => currentModel.includes(m));
          const isPremiumProposed = premiumModels.some(m => proposedModel.includes(m));
          if (isPremiumCurrent && !isPremiumProposed) {
            violations.push({
              constraint: `KPI "${highAccuracyKpis[0].name}" requires SLA >= ${highAccuracyKpis[0].slaThreshold}% — downgrading model may breach SLA`,
              current: agent.modelName || "unknown",
              proposed: proposedChanges.modelName,
              severity: "critical",
            });
          }
        }
      }

      if (proposedChanges.toolsConfig !== undefined) {
        const currentTools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig : [];
        const proposedTools = Array.isArray(proposedChanges.toolsConfig) ? proposedChanges.toolsConfig : [];
        const currentToolNames = new Set(currentTools.map((t: any) => t.name || t));
        const removedTools = currentTools.filter((t: any) => !proposedTools.some((pt: any) => (pt.name || pt) === (t.name || t)));
        if (removedTools.length > 0 && kpis.length > 0) {
          violations.push({
            constraint: `Removing ${removedTools.length} tool(s) may affect outcome KPI performance`,
            current: `${currentTools.length} tools configured`,
            proposed: `${proposedTools.length} tools configured`,
            severity: "warning",
          });
        }
      }

      if (proposedChanges.status === "paused" || proposedChanges.status === "retired" || proposedChanges.status === "decommissioning") {
        const activeKpis = kpis.filter(k => k.currentValue && k.slaThreshold && k.currentValue >= k.slaThreshold * 0.9);
        if (activeKpis.length > 0) {
          violations.push({
            constraint: `Agent is actively contributing to ${activeKpis.length} KPI(s) near or above SLA threshold — deactivating may cause SLA breach`,
            current: agent.status,
            proposed: proposedChanges.status,
            severity: "warning",
          });
        }
      }

      if (constraintGraph && typeof constraintGraph === "object") {
        const compConstraints = (constraintGraph as any).complianceConstraints;
        if (Array.isArray(compConstraints) && compConstraints.length > 0) {
          if (proposedChanges.complianceTags !== undefined) {
            const proposedTags = Array.isArray(proposedChanges.complianceTags) ? proposedChanges.complianceTags : [];
            const currentTags = Array.isArray(agent.complianceTags) ? agent.complianceTags : [];
            const removedTags = currentTags.filter((t: string) => !proposedTags.includes(t));
            if (removedTags.length > 0) {
              violations.push({
                constraint: `Outcome has compliance constraints — removing compliance tags may violate requirements`,
                current: currentTags.join(", ") || "none",
                proposed: proposedTags.join(", ") || "none",
                severity: "warning",
              });
            }
          }
        }
      }

      const valid = violations.filter(v => v.severity === "critical").length === 0;
      res.json({ valid, violations });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  /** What deleting this agent would take, before anyone confirms. */
  router.get("/api/agents/:id/removal", async (req, res) => {
    try {
      res.json(await planAgentRemoval(getOrgId(req), req.params.id as string));
    } catch (e) {
      if (e instanceof RemovalPlanError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  router.delete("/api/agents/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id as string, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      await storage.deleteAgent(req.params.id as string, getOrgId(req));
      const delTags = Array.isArray(agent.ontologyTags) ? (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) : [];
      await storage.createAuditEvent({
        actorType: "user",
        actorId: "ops_user",
        action: "delete_agent",
        objectType: "agent",
        objectId: agent.id,
        details: `Agent "${agent.name}" deleted`,
        ontologyTags: resolveOntologyTags("agent", "delete_agent", { agentOntologyTags: delTags }),
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to delete agent" });
    }
  });

  router.get("/api/agents/:id/traces", async (req, res) => {
    // Capped: this returned every run ever recorded, with each row's full payload.
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req), limit);
    res.json(traces);
  });

  router.get("/api/agents/:id/evals", async (req, res) => {
    const evals = await storage.getEvalsByAgent(req.params.id);
    res.json(evals);
  });

  router.get("/api/agents/:id/recommendations", async (req, res) => {
    const recs = await storage.getImprovementRecommendationsByAgent(req.params.id);
    res.json(recs);
  });

  router.get("/api/agents/:id/autonomous-actions", async (req, res) => {
    const logs = await storage.getAutonomousActionLogsByAgent(req.params.id);
    res.json(logs);
  });

  router.get("/api/agents/:id/context-layers", async (req, res) => {
    try {
      const agentId = req.params.id;
      const agent = await storage.getAgent(agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const estimateTokens = (text: string) => Math.ceil(text.length / 4);

      const layers: Array<{
        id: string; name: string; description: string;
        status: "populated" | "not_configured" | "dynamic";
        tokenEstimate: number; previewContent: string;
        sourceLabel?: string; sourceUrl?: string;
        itemCount?: number;
      }> = [];

      // Layer 1 — Outcome Contract
      try {
        if (agent.outcomeId) {
          const outcome = await storage.getOutcome(agent.outcomeId, getOrgId(req));
          if (outcome) {
            const kpis = await storage.getKpisByOutcome(agent.outcomeId);
            const lines: string[] = [];
            lines.push(`## OUTCOME CONTRACT`);
            lines.push(`Name: ${outcome.name}`);
            if (outcome.description) lines.push(`Description: ${outcome.description}`);
            lines.push(`Risk Tier: ${outcome.riskTier}`);
            lines.push(`Status: ${outcome.status}`);
            if ((outcome as any).slaDescription) lines.push(`SLA: ${(outcome as any).slaDescription}`);
            if (kpis.length > 0) {
              lines.push(`\n## KPI TARGETS`);
              kpis.forEach(kpi => {
                lines.push(`- ${kpi.name}: target=${kpi.target}, unit=${kpi.unit}, weight=${kpi.weight ?? 1}`);
              });
            }
            const preview = lines.join("\n");
            layers.push({
              id: "outcome", name: "Outcome Contract", description: "Business goals, KPIs, and SLAs governing this agent",
              status: "populated", tokenEstimate: estimateTokens(preview), previewContent: preview,
              sourceLabel: outcome.name, sourceUrl: `/outcomes/${agent.outcomeId}`,
              itemCount: kpis.length,
            });
          } else {
            layers.push({ id: "outcome", name: "Outcome Contract", description: "Business goals, KPIs, and SLAs governing this agent", status: "not_configured", tokenEstimate: 0, previewContent: "No outcome linked. Assign an outcome to this agent to populate this layer.", sourceUrl: "/outcomes" });
          }
        } else {
          layers.push({ id: "outcome", name: "Outcome Contract", description: "Business goals, KPIs, and SLAs governing this agent", status: "not_configured", tokenEstimate: 0, previewContent: "No outcome linked. Assign an outcome to this agent to populate this layer.", sourceUrl: "/outcomes" });
        }
      } catch { layers.push({ id: "outcome", name: "Outcome Contract", description: "Business goals, KPIs, and SLAs governing this agent", status: "not_configured", tokenEstimate: 0, previewContent: "Could not load outcome." }); }

      // Layer 2 — Industry Governance
      try {
        // Same resolver the runtime uses, so this preview shows the policies
        // an agent is actually given -- it previously listed the first 10 org
        // policies regardless of bindings, disagreeing with the runtime.
        const policyEntries = await resolveGovernancePromptEntries(req.params.id, getOrgId(req));
        const ontologyTags = Array.isArray((agent as any).ontologyTags) ? (agent as any).ontologyTags as Array<{ conceptId: string; conceptLabel: string }> : [];
        const lines: string[] = [];
        // Rendered by the same function agent-runtime and evaluated prompts use,
        // so the inspector shows what the agent actually receives: CONFIDENTIAL
        // tags, the silent-compliance instruction, and only the policies that fit
        // the governance budget. A hand-rolled copy here had drifted on all three.
        const governanceBlock = renderGovernanceBlock(policyEntries).trim();
        if (governanceBlock) {
          lines.push(governanceBlock);
          const rendered = (governanceBlock.match(/^- \[/gm) || []).length;
          if (rendered < policyEntries.length) {
            lines.push(`\n(${rendered} of ${policyEntries.length} applicable policies fit the governance budget; bound policies are placed first.)`);
          }
        }
        if (ontologyTags.length > 0) {
          lines.push(`\n## ONTOLOGY CONCEPTS`);
          ontologyTags.forEach(t => lines.push(`- ${t.conceptLabel} (${t.conceptId})`));
        }
        const preview = lines.join("\n");
        layers.push({
          id: "governance", name: "Industry Governance", description: "Active compliance policies and ontology concept tags",
          status: policyEntries.length > 0 || ontologyTags.length > 0 ? "populated" : "not_configured",
          tokenEstimate: estimateTokens(preview), previewContent: preview,
          sourceLabel: "Governance", sourceUrl: "/governance",
          itemCount: policyEntries.length + ontologyTags.length,
        });
      } catch { layers.push({ id: "governance", name: "Industry Governance", description: "Active compliance policies and ontology concept tags", status: "not_configured", tokenEstimate: 0, previewContent: "Could not load governance data." }); }

      // Layer 3 — Agent Capabilities
      try {
        const mcpLinks = await storage.getAgentMcpServers(agentId);
        const mcpToolLines: string[] = [];
        for (const link of mcpLinks.slice(0, 5)) {
          const tools = await storage.getMcpServerTools(link.serverId);
          tools.slice(0, 8).forEach(t => mcpToolLines.push(`  - ${t.name}: ${t.description || ""}`));
        }
        // Explicit assignment: use preloadedSkills if the agent has them
        const rawPreloaded = (agent as any).preloadedSkills;
        const preloadedEntries: Array<{ skillId: string }> = Array.isArray(rawPreloaded) ? rawPreloaded as Array<{ skillId: string }> : [];
        const explicitSkillIds = preloadedEntries.map((ps: any) => ps.skillId).filter(Boolean);

        let relevantSkills: any[];
        let skillSource: "assigned" | "auto-matched";
        if (explicitSkillIds.length > 0) {
          const resolved = await storage.getSkillsByIds(explicitSkillIds);
          // Preserve explicit assignment order (IN clause does not guarantee order)
          const byId = new Map(resolved.map((s: any) => [s.id, s]));
          relevantSkills = explicitSkillIds.map(id => byId.get(id)).filter((s: any): s is any => !!s && s.status === "active").slice(0, 20);
          skillSource = "assigned";
        } else {
          const allSkills = await storage.getSkills(getOrgId(req));
          const agentIndustry = agent.industryId?.toLowerCase();
          const ontologyLabels = Array.isArray((agent as any).ontologyTags) ? ((agent as any).ontologyTags as Array<{ conceptLabel: string }>).map(t => t.conceptLabel.toLowerCase()) : [];
          relevantSkills = allSkills.filter((s: any) => {
            if (s.status !== "active") return false;
            if (agentIndustry && s.industry?.toLowerCase() === agentIndustry) return true;
            if (ontologyLabels.length > 0) {
              const skillTags = (s.tags || []).map((t: string) => t.toLowerCase());
              const skillDomain = s.domain?.toLowerCase() || "";
              return ontologyLabels.some((label: string) => skillTags.includes(label) || skillDomain.includes(label));
            }
            return false;
          }).slice(0, 20);
          skillSource = "auto-matched";
        }
        const skillSources = relevantSkills.map((s: any) => ({
          skillId: s.id,
          name: s.name,
          source: skillSource as "assigned" | "auto-matched",
        }));
        const sourceTag = skillSource === "assigned" ? "[Assigned]" : "[Auto-matched]";
        const CAPABILITIES_BUDGET = 500;
        const lines: string[] = [];
        // Assigned skills -- the agent's own and, for an orchestrator, its direct
        // members' -- reach the model as the read_skill catalog and are loaded on
        // demand (server/builtin-skill-tools.ts), so preview exactly that.
        const readableSkills = await resolveReadableSkills(agentId, getOrgId(req));
        if (readableSkills.length > 0) {
          lines.push(skillCatalogPrompt(readableSkills));
          lines.push("Procedures are loaded on demand with the read_skill tool.");
        } else if (relevantSkills.length > 0) {
          const sectionHeader = `## AGENT SKILLS (${skillSource === "assigned" ? "explicitly assigned" : "auto-matched by industry/tags"})`;
          lines.push(sectionHeader);
          let skillTokensUsed = estimateTokens(sectionHeader);
          for (const s of relevantSkills) {
            const header = `- ${s.name} (${s.domain}, v${s.version}) ${sourceTag}`;
            const useFullBody = s.contextMode === "full" && s.markdownBody && (s.markdownBody as string).trim().length > 0;
            if (useFullBody) {
              const headerLine = `${header}:`;
              const headerTokens = estimateTokens(headerLine);
              if (skillTokensUsed + headerTokens > CAPABILITIES_BUDGET) break;
              const remainingBudget = CAPABILITIES_BUDGET - skillTokensUsed - headerTokens;
              if (remainingBudget <= 0) {
                const fallback = `${header}: ${s.description}`;
                const ft = estimateTokens(fallback);
                if (skillTokensUsed + ft <= CAPABILITIES_BUDGET) {
                  lines.push(fallback);
                  skillTokensUsed += ft;
                }
                continue;
              }
              const maxChars = remainingBudget * 4;
              const body = (s.markdownBody as string).length > maxChars
                ? (s.markdownBody as string).substring(0, maxChars) + "\n...[truncated]"
                : (s.markdownBody as string);
              lines.push(`${headerLine}\n${body}`);
              skillTokensUsed += headerTokens + estimateTokens(body);
            } else {
              const line = `${header}: ${s.description}`;
              const lt = estimateTokens(line);
              if (skillTokensUsed + lt > CAPABILITIES_BUDGET) break;
              lines.push(line);
              skillTokensUsed += lt;
            }
          }
        }
        if (mcpToolLines.length > 0) {
          lines.push(`\n## MCP TOOLS (${mcpLinks.length} server(s))`);
          lines.push(...mcpToolLines);
        }
        if (lines.length === 0) lines.push("No skills or MCP tools linked to this agent.");
        const preview = lines.join("\n");
        layers.push({
          id: "capabilities", name: "Agent Capabilities", description: "Skills explicitly assigned or auto-matched, plus MCP server tools available to this agent",
          status: readableSkills.length > 0 || relevantSkills.length > 0 || mcpLinks.length > 0 ? "populated" : "not_configured",
          tokenEstimate: estimateTokens(preview), previewContent: preview,
          sourceLabel: "Skills", sourceUrl: "/skills",
          itemCount: (readableSkills.length || relevantSkills.length) + mcpLinks.length,
        });
      } catch { layers.push({ id: "capabilities", name: "Agent Capabilities", description: "Linked skills and MCP server tools available to this agent", status: "not_configured", tokenEstimate: 0, previewContent: "Could not load capabilities." }); }

      // Layer 4 — Knowledge Retrieval
      try {
        const kbLinks = await storage.getAgentKnowledgeBases(agentId);
        const lines: string[] = [];
        lines.push(`## KNOWLEDGE BASES (${kbLinks.length})`);
        let totalChunks = 0;
        for (const link of kbLinks) {
          const kb = await storage.getKnowledgeBase(link.knowledgeBaseId);
          const chunks = await storage.getKnowledgeChunks(link.knowledgeBaseId);
          totalChunks += chunks.length;
          const sampleChunk = chunks[0]?.content?.substring(0, 200) || "";
          lines.push(`\n- ${kb?.name || link.knowledgeBaseId}: ${chunks.length} chunks`);
          if (sampleChunk) lines.push(`  Sample: "${sampleChunk}${sampleChunk.length >= 200 ? "..." : ""}"`);
        }
        if (kbLinks.length === 0) lines.push("No knowledge bases linked to this agent.");
        const preview = lines.join("\n");
        layers.push({
          id: "knowledge", name: "Knowledge Retrieval", description: "Linked Knowledge Bases queried at runtime for relevant context",
          status: kbLinks.length > 0 ? "populated" : "not_configured",
          tokenEstimate: kbLinks.length > 0 ? estimateTokens(preview) : 0, previewContent: preview,
          sourceLabel: "Knowledge", sourceUrl: "/knowledge-bases",
          itemCount: totalChunks,
        });
      } catch { layers.push({ id: "knowledge", name: "Knowledge Retrieval", description: "Linked Knowledge Bases queried at runtime for relevant context", status: "not_configured", tokenEstimate: 0, previewContent: "Could not load knowledge bases." }); }

      // Layer 5 — Execution History
      try {
        const allTraces = await storage.getTracesByAgent(agentId, getOrgId(req));
        const recentCompleted = allTraces.filter((t: any) => t.status === "completed").slice(0, 5);
        const lines: string[] = [];
        lines.push(`## EXECUTION HISTORY (last ${recentCompleted.length} completed runs)`);
        recentCompleted.forEach((t: any, i: number) => {
          const steps = Array.isArray(t.stepsJson) ? t.stepsJson as any[] : [];
          const toolsUsed = Array.from(new Set(steps.filter((s: any) => s.type === "tool_call").map((s: any) => s.toolName || s.name || "unknown"))).slice(0, 3);
          const rawDecisions = Array.isArray(t.decisions) ? t.decisions as any[] : [];
          const keyDecisions = rawDecisions.slice(0, 2).map((d: any) => d.decision || d.action || d.label || d.description || JSON.stringify(d)).filter(Boolean);
          lines.push(`\nRun ${i + 1}: ${t.inputSummary?.substring(0, 80) || "Scheduled run"}`);
          lines.push(`  Status: ${t.status} | Latency: ${t.latencyMs}ms | Cost: $${(t.costUsd || 0).toFixed(4)}`);
          if (toolsUsed.length > 0) lines.push(`  Tools: ${toolsUsed.join(", ")}`);
          if (keyDecisions.length > 0) lines.push(`  Key decisions: ${keyDecisions.join("; ")}`);
          if (t.outputSummary) lines.push(`  Output: ${t.outputSummary.substring(0, 100)}`);
        });
        if (recentCompleted.length === 0) lines.push("No completed runs yet.");
        const preview = lines.join("\n");
        layers.push({
          id: "history", name: "Execution History", description: "Recent completed run summaries injected for continuity",
          status: recentCompleted.length > 0 ? "populated" : "not_configured",
          tokenEstimate: recentCompleted.length > 0 ? estimateTokens(preview) : 0, previewContent: preview,
          sourceLabel: "Monitor", sourceUrl: "/monitor",
          itemCount: recentCompleted.length,
        });
      } catch { layers.push({ id: "history", name: "Execution History", description: "Recent completed run summaries injected for continuity", status: "not_configured", tokenEstimate: 0, previewContent: "Could not load execution history." }); }

      // Layer 6 — Task Context
      layers.push({
        id: "task", name: "Task Context", description: "The runtime task prompt — provided at invocation time",
        status: "dynamic", tokenEstimate: 0,
        previewContent: `This layer is populated at invocation time with the specific task prompt.\n\nCurrent configured prompt:\n${((agent.runtimeConfig as any)?.prompt || "No prompt configured yet.").substring(0, 300)}`,
        sourceLabel: "Agent Config", sourceUrl: `/agents/${agentId}`,
      });

      res.json(layers);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load context layers" });
    }
  });

  router.get("/api/agents/:id/versions", async (req, res) => {
    const versions = await storage.getAgentVersions(req.params.id);
    const deployments = await storage.getDeployments(getOrgId(req));
    const agentDeps = deployments.filter(d => d.agentId === req.params.id && d.version);
    const existingSemvers = new Set(versions.map(v => v.semver));
    const missingVersions: string[] = [];
    for (const dep of agentDeps) {
      if (dep.version && !existingSemvers.has(dep.version)) {
        existingSemvers.add(dep.version);
        missingVersions.push(dep.version);
      }
    }
    for (const sv of missingVersions) {
      await storage.ensureAgentVersion(req.params.id, sv, "active");
    }
    if (missingVersions.length > 0) {
      const refreshed = await storage.getAgentVersions(req.params.id);
      return res.json(refreshed);
    }
    res.json(versions);
  });

  router.get("/api/agents/:id/deployment-recommendation", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const riskTier = agent.riskTier || "LOW";
      let slaRequirements: Array<{ kpiName: string; slaThreshold: number; target: number; unit: string }> = [];
      let outcomeName: string | null = null;
      let maxSla = 0;

      if (agent.outcomeId) {
        const outcome = await storage.getOutcome(agent.outcomeId, getOrgId(req));
        outcomeName = outcome?.name || null;
        const kpis = await storage.getKpisByOutcome(agent.outcomeId);
        const percentUnits = ["percent", "%", "percentage", "rate", "ratio", "pct"];
        slaRequirements = kpis
          .filter(k => k.slaThreshold != null && k.slaThreshold > 0)
          .map(k => ({ kpiName: k.name, slaThreshold: k.slaThreshold!, target: k.target, unit: k.unit }));
        const percentSlaKpis = slaRequirements.filter(s => percentUnits.includes(s.unit.toLowerCase()) || s.slaThreshold <= 100);
        maxSla = percentSlaKpis.length > 0 ? Math.max(...percentSlaKpis.map(s => s.slaThreshold)) : 0;
      }

      const isHighRisk = riskTier === "HIGH" || riskTier === "CRITICAL";
      const isStrictSla = maxSla >= 95;
      const isVeryStrictSla = maxSla >= 99;

      let strategy = "direct";
      let reason = "No strict SLA requirements detected — direct deploy is acceptable";
      let canaryConfig: any = undefined;
      let rollbackConfig: any = undefined;
      let allowDirectDeploy = true;

      if (isVeryStrictSla || (isHighRisk && isStrictSla)) {
        strategy = "canary";
        allowDirectDeploy = false;
        reason = isVeryStrictSla
          ? `Outcome "${outcomeName}" requires ≥${maxSla.toFixed(1)}% SLA — canary deployment with tight rollback thresholds is mandatory`
          : `High risk tier (${riskTier}) with ≥${maxSla.toFixed(1)}% SLA — canary deployment strongly recommended`;
        canaryConfig = {
          startPercent: isVeryStrictSla ? 1 : 5,
          stepPercent: isVeryStrictSla ? 5 : 10,
          intervalMinutes: isVeryStrictSla ? 30 : 15,
          successThreshold: isVeryStrictSla ? 0.995 : 0.95,
          maxErrorRate: isVeryStrictSla ? 0.005 : 0.02,
        };
        rollbackConfig = {
          autoRollbackEnabled: true,
          triggers: [
            { metric: "eval_pass_rate_drop", operator: ">", value: isVeryStrictSla ? "2%" : "5%", windowMinutes: 15 },
            { metric: "policy_violations", operator: ">", value: isVeryStrictSla ? "1" : "3", windowMinutes: 30 },
            { metric: "kpi_confidence", operator: "<", value: isVeryStrictSla ? "0.95" : "0.85", windowMinutes: 30 },
          ],
          cooldownMinutes: isVeryStrictSla ? 5 : 10,
        };
      } else if (isStrictSla) {
        strategy = "canary";
        allowDirectDeploy = false;
        reason = `Outcome "${outcomeName}" requires ≥${maxSla.toFixed(1)}% SLA — canary deployment recommended`;
        canaryConfig = {
          startPercent: 5,
          stepPercent: 15,
          intervalMinutes: 15,
          successThreshold: 0.95,
          maxErrorRate: 0.03,
        };
        rollbackConfig = {
          autoRollbackEnabled: true,
          triggers: [
            { metric: "eval_pass_rate_drop", operator: ">", value: "5%", windowMinutes: 30 },
            { metric: "policy_violations", operator: ">", value: "3", windowMinutes: 60 },
            { metric: "kpi_confidence", operator: "<", value: "0.8", windowMinutes: 60 },
          ],
          cooldownMinutes: 10,
        };
      } else if (isHighRisk) {
        strategy = "canary";
        allowDirectDeploy = false;
        reason = `Agent has ${riskTier} risk tier — canary deployment recommended for safety`;
        canaryConfig = {
          startPercent: 10,
          stepPercent: 25,
          intervalMinutes: 15,
          successThreshold: 0.95,
          maxErrorRate: 0.05,
        };
        rollbackConfig = {
          autoRollbackEnabled: true,
          triggers: [
            { metric: "eval_pass_rate_drop", operator: ">", value: "10%", windowMinutes: 30 },
            { metric: "policy_violations", operator: ">", value: "5", windowMinutes: 60 },
            { metric: "kpi_confidence", operator: "<", value: "0.7", windowMinutes: 60 },
          ],
          cooldownMinutes: 15,
        };
      }

      const memGovRules = (agent.memoryGovernanceRules as Array<{ rule: string; regulation: string; type: string }>) || [];
      const allProfiles = await storage.getMemoryProfiles();
      const hasMemoryProfile = allProfiles.some(p => p.agentId === agent.id);
      const memoryGovernance = {
        hasRules: memGovRules.length > 0,
        ruleCount: memGovRules.length,
        hasProfile: hasMemoryProfile,
        compliant: memGovRules.length > 0 && hasMemoryProfile,
        regulations: Array.from(new Set(memGovRules.map(r => r.regulation))),
      };

      res.json({
        agentId: agent.id,
        agentName: agent.name,
        outcomeName,
        outcomeId: agent.outcomeId,
        riskLevel: riskTier,
        allowDirectDeploy,
        slaRequirements,
        recommended: { strategy, canaryConfig, rollbackConfig, reason },
        memoryGovernance,
      });
    } catch (e) {
      console.error("[deployment-recommendation] Error:", e);
      res.status(500).json({ error: "Failed to compute deployment recommendation" });
    }
  });

  router.get("/api/agents/:id/memory-compliance", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const rules = (agent.memoryGovernanceRules as Array<{ rule: string; regulation: string; type: string }>) || [];
      const complianceTags = (agent.complianceTags as string[]) || [];
      
      const checks: Array<{ rule: string; status: "pass" | "warn" | "fail"; detail: string }> = [];
      
      if (rules.length > 0) {
        checks.push({ rule: "Governance Rules Configured", status: "pass", detail: rules.length + " rules active" });
      } else {
        const needsRules = complianceTags.some(t => ["HIPAA", "PCI-DSS", "SOX", "GDPR", "BSA"].includes(t.toUpperCase()));
        checks.push({ rule: "Governance Rules Configured", status: needsRules ? "fail" : "warn", detail: needsRules ? "Agent has compliance tags but no memory governance rules" : "No memory governance rules configured" });
      }

      const allProfiles = await storage.getMemoryProfiles();
      const linkedProfile = allProfiles.find(p => p.agentId === agent.id);
      if (linkedProfile) {
        checks.push({ rule: "Memory Profile Linked", status: "pass", detail: "Profile: " + linkedProfile.name });
      } else {
        checks.push({ rule: "Memory Profile Linked", status: rules.length > 0 ? "warn" : "fail", detail: "No memory profile linked to agent" });
      }

      const hasRetention = rules.some(r => r.type === "retention");
      if (hasRetention) {
        checks.push({ rule: "Retention Policy Defined", status: "pass", detail: rules.filter(r => r.type === "retention").map(r => r.regulation).join(", ") });
      } else if (complianceTags.length > 0) {
        checks.push({ rule: "Retention Policy Defined", status: "warn", detail: "Compliance tags present but no retention rules" });
      }

      const needsEncryption = complianceTags.some(t => ["HIPAA", "PCI-DSS"].includes(t.toUpperCase()));
      const hasEncryption = rules.some(r => r.type === "encryption");
      if (needsEncryption) {
        checks.push({ rule: "Encryption Requirements", status: hasEncryption ? "pass" : "fail", detail: hasEncryption ? "Encryption rules configured" : "HIPAA/PCI requires encryption rules" });
      } else if (hasEncryption) {
        checks.push({ rule: "Encryption Requirements", status: "pass", detail: "Encryption rules configured" });
      }

      const needsErasure = complianceTags.some(t => ["GDPR"].includes(t.toUpperCase()));
      const hasErasure = rules.some(r => r.type === "erasure");
      if (needsErasure) {
        checks.push({ rule: "Erasure Policy (GDPR)", status: hasErasure ? "pass" : "fail", detail: hasErasure ? "Erasure policy configured" : "GDPR requires erasure policy" });
      }

      if (linkedProfile) {
        const tierConfigs = linkedProfile.tierConfigs as any;
        const hasEncryptedTiers = tierConfigs && (tierConfigs.working?.encrypted || tierConfigs.episodic?.encrypted);
        if (needsEncryption) {
          checks.push({ rule: "Tier Encryption", status: hasEncryptedTiers ? "pass" : "warn", detail: hasEncryptedTiers ? "Memory tiers configured with encryption" : "Memory tiers should have encryption enabled" });
        }
      }

      const violations: Array<{ traceId: string; violation: string; timestamp: string }> = [];
      try {
        const recentEvents = await storage.getAuditEvents(getOrgId(req));
        const govViolations = recentEvents.filter(e => 
          e.objectId === agent.id && 
          e.action === "memory_governance.violation"
        ).slice(0, 5);
        for (const ev of govViolations) {
          const details = typeof ev.details === "string" ? JSON.parse(ev.details) : ev.details;
          violations.push({ traceId: details?.traceId || ev.id, violation: details?.summary || "Governance violation", timestamp: ev.createdAt?.toISOString() || "" });
        }
      } catch {}

      const passCount = checks.filter(c => c.status === "pass").length;
      const failCount = checks.filter(c => c.status === "fail").length;
      const score = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 0;

      res.json({ score, checks, violations, hasGovernanceRules: rules.length > 0, profileLinked: !!linkedProfile });
    } catch (e) {
      console.error("[memory-compliance] Error:", e);
      res.status(500).json({ error: "Failed to check memory compliance" });
    }
  });

  router.get("/api/agents/:id/ontology-compliance", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const ontologyTags = (agent.ontologyTags as Array<{ conceptId: string; conceptLabel: string }>) || [];
      if (ontologyTags.length === 0) {
        return res.json({
          agentId: agent.id,
          hasOntology: false,
          requiredTerms: [],
          deprecatedTerms: [],
          recentCompliance: [],
          averageScore: null,
          trend: "stable",
          topNonStandardTerms: [],
        });
      }

      const requiredTerms: string[] = [];
      const deprecatedTerms: Array<{ deprecated: string; useInstead: string }> = [];
      for (const tag of ontologyTags.slice(0, 15)) {
        try {
          const concept = await storage.getOntologyConcept(tag.conceptId);
          if (concept) {
            requiredTerms.push(concept.label);
            if (concept.synonyms && concept.synonyms.length > 0) {
              for (const syn of concept.synonyms) {
                deprecatedTerms.push({ deprecated: syn, useInstead: concept.label });
              }
            }
          }
        } catch {}
      }

      const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req));
      const recentTraces = traces.slice(0, 20);

      const recentCompliance: Array<{
        traceId: string;
        score: number;
        canonicalCount: number;
        deprecatedCount: number;
        timestamp: string;
        deprecatedTermsUsed: Array<{ term: string; shouldUse: string }>;
      }> = [];

      const topNonStandardMap: Record<string, { count: number; shouldUse: string }> = {};

      for (const trace of recentTraces) {
        const stepsJson = trace.stepsJson as any[];
        if (!stepsJson || !Array.isArray(stepsJson)) continue;

        const complianceStep = stepsJson.find(
          (s: any) => s.type === "validation" && s.output?.ontologyCompliance
        );
        if (!complianceStep?.output?.ontologyCompliance) continue;

        const oc = complianceStep.output.ontologyCompliance;
        recentCompliance.push({
          traceId: trace.id,
          score: oc.score,
          canonicalCount: oc.canonicalCount || 0,
          deprecatedCount: oc.deprecatedCount || 0,
          timestamp: trace.startedAt?.toISOString?.() || (trace.startedAt ? String(trace.startedAt) : new Date().toISOString()),
          deprecatedTermsUsed: oc.deprecatedTermsUsed || [],
        });

        for (const dt of oc.deprecatedTermsUsed || []) {
          const key = dt.term?.toLowerCase();
          if (key) {
            if (!topNonStandardMap[key]) topNonStandardMap[key] = { count: 0, shouldUse: dt.shouldUse };
            topNonStandardMap[key].count++;
          }
        }
      }

      const scores = recentCompliance.map(c => c.score);
      const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      let trend: "improving" | "declining" | "stable" = "stable";
      if (scores.length >= 3) {
        const recent = scores.slice(0, Math.ceil(scores.length / 2));
        const older = scores.slice(Math.ceil(scores.length / 2));
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        if (recentAvg - olderAvg > 5) trend = "improving";
        else if (olderAvg - recentAvg > 5) trend = "declining";
      }

      const topNonStandardTerms = Object.entries(topNonStandardMap)
        .map(([term, data]) => ({ term, shouldUse: data.shouldUse, occurrences: data.count }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5);

      res.json({
        agentId: agent.id,
        hasOntology: true,
        requiredTerms,
        deprecatedTerms: deprecatedTerms.slice(0, 20),
        recentCompliance: recentCompliance.slice(0, 10),
        averageScore,
        trend,
        topNonStandardTerms,
      });
    } catch (e) {
      console.error("[ontology-compliance] Error:", e);
      res.status(500).json({ error: "Failed to compute ontology compliance" });
    }
  });

  router.post("/api/agents/:id/policy-check", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const bundle = await resolvePolicyBundle(req.params.id, getOrgId(req));

      // Dry-run compliance check: scan system prompt against guardrails
      const systemPrompt = (agent as any).agentSystemPrompt || (agent as any).systemPrompt || (agent as any).prompt || "";
      const violations: Array<{ type: string; message: string; severity: "warn" | "error" }> = [];

      for (const guardrail of bundle.guardrails) {
        const guardrailLower = guardrail.toLowerCase();
        const systemPromptLower = systemPrompt.toLowerCase();
        // Simple pattern: if a guardrail keyword looks like a prohibited instruction, flag it
        if (guardrailLower.startsWith("no ") || guardrailLower.startsWith("never ") || guardrailLower.startsWith("do not ")) {
          // These are prohibitions — check if the system prompt is instructing the agent to do the forbidden thing
          const prohibited = guardrailLower.replace(/^(no |never |do not )/, "");
          if (systemPromptLower.includes(prohibited)) {
            violations.push({ type: "guardrail_conflict", message: `System prompt may conflict with guardrail: "${guardrail}"`, severity: "warn" });
          }
        }
      }

      // Check if any blocked tools appear to be referenced in the system prompt
      for (const blockedTool of bundle.blockedTools) {
        if (systemPrompt.toLowerCase().includes(blockedTool.toLowerCase())) {
          violations.push({ type: "blocked_tool_reference", message: `System prompt references blocked tool: "${blockedTool}"`, severity: "error" });
        }
      }

      const passed = violations.filter(v => v.severity !== "error").length;
      const failed = violations.filter(v => v.severity === "error").length;
      const warned = violations.filter(v => v.severity === "warn").length;
      const now = new Date().toISOString();

      // Persist as a lightweight trace record so lastComplianceCheck is populated
      try {
        await storage.createTrace({
          agentId: agent.id,
          organizationId: getOrgId(req),
          environment: "dry-run",
          status: failed > 0 ? "failed" : "completed",
          latencyMs: 0,
          costUsd: 0,
          inputSummary: "Policy dry-run check",
          outputSummary: `${bundle.appliedPolicies.length} policies checked; ${failed} error(s), ${warned} warning(s)`,
          policyChecks: {
            policies: bundle.appliedPolicies.map(p => ({ policyId: p.id, policyName: p.name, domain: p.domain, scope: p.scope, version: p.version, enforcement: p.enforcement })),
            policyCount: bundle.appliedPolicies.length,
            violations: violations.map(v => ({ ...v, policyIds: [] })),
            passed,
            capturedAt: now,
          },
        });
      } catch {}

      res.json({
        agentId: agent.id,
        checkedAt: now,
        policyCount: bundle.appliedPolicies.length,
        violations,
        passedCount: passed,
        warnCount: warned,
        errorCount: failed,
        status: failed > 0 ? "failed" : warned > 0 ? "warn" : "passed",
      });
    } catch (e: any) {
      console.error("[policy-check] Error:", e);
      res.status(500).json({ error: "Policy check failed" });
    }
  });

  router.get("/api/agents/:id/policy-readiness", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id, getOrgId(req));
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const bundle = await resolvePolicyBundle(req.params.id, getOrgId(req));

      const orgPolicies = bundle.appliedPolicies.filter((p: any) => p.scope === "org");
      const outcomePolicies = bundle.appliedPolicies.filter((p: any) => p.scope === "outcome");
      const agentScopedPolicies = bundle.appliedPolicies.filter((p: any) => p.scope === "agent");
      const envPolicies = bundle.appliedPolicies.filter((p: any) => p.scope === "env");

      const policyScore = (() => {
        let score = 100;
        if (bundle.appliedPolicies.length === 0) score -= 30;
        if (orgPolicies.length === 0) score -= 20;
        const hasMissingDomains: string[] = [];
        const coveredDomains = new Set(bundle.appliedPolicies.map((p: any) => p.domain).filter(Boolean));
        const expectedDomains = ["data_handling", "model_governance", "deployment"];
        for (const d of expectedDomains) {
          if (!coveredDomains.has(d)) { hasMissingDomains.push(d); score -= 10; }
        }
        return { score: Math.max(0, score), missingDomains: hasMissingDomains, coveredDomains: Array.from(coveredDomains) };
      })();

      const redactPatternSample = bundle.redactPatterns.slice(0, 5);
      const guardrailSample = bundle.guardrails.slice(0, 5);

      // Fetch last hard violation and last compliance check from traces + audit events
      let lastHardViolation: { action: string; details: any; createdAt: any } | null = null;
      let lastComplianceCheck: { passedCount: number; violationCount: number; timestamp: string; policyCount: number } | null = null;
      try {
        const auditEventsForAgent = await storage.getAuditEvents(getOrgId(req));
        const agentViolations = auditEventsForAgent
          .filter(e => (e.action === "hard_violation" || e.action === "policy_violation") && e.objectId === agent.id)
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        if (agentViolations.length > 0) {
          const v = agentViolations[0];
          let details: any = {};
          try { details = JSON.parse(v.details || "{}"); } catch {}
          lastHardViolation = { action: v.action, details, createdAt: v.createdAt };
        }

        const traces = await storage.getTracesByAgent(agent.id, getOrgId(req));
        const tracesWithChecks = traces
          .filter(t => t.policyChecks)
          .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
        if (tracesWithChecks.length > 0) {
          const checks = tracesWithChecks[0].policyChecks as any;
          lastComplianceCheck = {
            passedCount: checks?.passed ?? (Array.isArray(checks?.policies) ? checks.policies.length : 0),
            violationCount: Array.isArray(checks?.violations) ? checks.violations.length : 0,
            policyCount: Array.isArray(checks?.policies) ? checks.policies.length : (checks?.policyCount ?? 0),
            timestamp: tracesWithChecks[0].startedAt?.toString() || new Date().toISOString(),
          };
        }
      } catch {}

      res.json({
        agentId: agent.id,
        agentName: agent.name,
        readinessScore: policyScore.score,
        appliedPolicies: bundle.appliedPolicies,
        policyCountByScope: {
          org: orgPolicies.length,
          outcome: outcomePolicies.length,
          agent: agentScopedPolicies.length,
          env: envPolicies.length,
        },
        blockedTools: bundle.blockedTools,
        toolAllowlist: bundle.toolAllowlist,
        guardrails: guardrailSample,
        guardrailCount: bundle.guardrails.length,
        redactPatterns: redactPatternSample,
        redactPatternCount: bundle.redactPatterns.length,
        missingDomains: policyScore.missingDomains,
        coveredDomains: policyScore.coveredDomains,
        agentConfig: bundle.agentConfig,
        lastHardViolation,
        lastComplianceCheck,
      });
    } catch (e: any) {
      console.error("[policy-readiness] Error:", e);
      res.status(500).json({ error: "Failed to compute policy readiness" });
    }
  });

  router.get("/api/eval-suites", async (_req, res) => {
    const suites = await storage.getEvalSuites();
    res.json(suites);
  });

  router.get("/api/traces", checkPermission("view_traces"), async (req, res) => {
    const role = getRequestRole(req);
    const level = getRedactionLevel(role);
    const traces = await storage.getTraces(getOrgId(req));
    res.json(traces.map(t => redactPayload(t, level)));
  });

  router.get("/api/traces/:id", checkPermission("view_traces"), async (req, res) => {
    const role = getRequestRole(req);
    const level = getRedactionLevel(role);
    const trace = await storage.getTrace(req.params.id as string, getOrgId(req));
    if (!trace) return res.status(404).json({ error: "Trace not found" });
    res.json(redactPayload(trace, level));
  });

  router.post("/api/traces", async (req, res) => {
    try {
      const data = insertRunTraceSchema.parse(req.body);
      const trace = await storage.createTrace(data);
      res.status(201).json(trace);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/provenance/:traceId", checkPermission("view_traces"), async (req, res) => {
    try {
      const trace = await storage.getTrace(req.params.traceId as string);
      if (!trace) return res.status(404).json({ error: "Trace not found" });

      let integrityStatus: any = { valid: false, checks: {} };
      try {
        const snapshot = trace.provenanceSnapshot as any;
        const storedHash = trace.provenanceHash;
        let snapshotHashMatch = false;
        if (snapshot && storedHash) {
          const recomputed = nodeCrypto.createHash("sha256")
            .update(canonicalJsonStringify(snapshot))
            .digest("hex");
          snapshotHashMatch = recomputed === storedHash;
        }

        let auditEventFound = false;
        let auditChainValid = false;
        if (trace.auditEventId) {
          const events = await storage.getAuditEvents(getOrgId(req));
          const auditEvent = events.find(e => e.id === trace.auditEventId);
          auditEventFound = !!auditEvent;
          if (auditEvent && auditEvent.sequenceNum) {
            const chainResult = await storage.verifyAuditChainIntegrity();
            auditChainValid = chainResult.valid;
          }
        }

        integrityStatus = {
          valid: snapshotHashMatch && auditEventFound && auditChainValid,
          checks: { snapshotHashMatch, auditEventFound, auditChainValid },
        };
      } catch {}

      res.json({
        traceId: trace.id,
        agentId: trace.agentId,
        provenanceSnapshot: trace.provenanceSnapshot || null,
        provenanceHash: trace.provenanceHash || null,
        auditEventId: trace.auditEventId || null,
        retrievedDocs: trace.retrievedDocs || null,
        integrity: integrityStatus,
        capturedAt: (trace.provenanceSnapshot as any)?.capturedAt || trace.startedAt,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/provenance/:traceId/reconstruct", checkPermission("view_traces"), async (req, res) => {
    try {
      const trace = await storage.getTrace(req.params.traceId as string);
      if (!trace) return res.status(404).json({ error: "Trace not found" });

      const snapshot = (trace.provenanceSnapshot || {}) as any;
      const available: any = {};
      const unavailable: string[] = [];

      if (snapshot.blueprintId) {
        try {
          const blueprints = await storage.getBlueprints();
          const bp = blueprints.find(b => b.id === snapshot.blueprintId);
          if (bp) {
            available.blueprint = {
              id: bp.id,
              name: bp.name,
              versionHistory: bp.versionHistory,
              currentVersion: bp.version,
              workflowJson: bp.blueprintJson,
            };
          } else {
            unavailable.push("blueprint");
          }
        } catch { unavailable.push("blueprint"); }
      }

      if (snapshot.kbRetrievals && Array.isArray(snapshot.kbRetrievals)) {
        available.knowledgeBases = [];
        for (const kbr of snapshot.kbRetrievals) {
          try {
            const kb = await storage.getKnowledgeBase(kbr.kbId);
            const allChunks = await storage.getKnowledgeChunks(kbr.kbId);
            const resolvedChunks = kbr.chunks.map((c: any) => {
              const foundChunk = allChunks.find((ac: any) => ac.id === c.chunkId);
              return {
                ...c,
                content: foundChunk?.content || null,
                stillAvailable: !!foundChunk,
              };
            });
            available.knowledgeBases.push({
              kbId: kbr.kbId,
              kbName: kbr.kbName || kb?.name || kbr.kbId,
              embeddingModel: kbr.embeddingModel,
              chunks: resolvedChunks,
            });
          } catch {
            unavailable.push(`kb:${kbr.kbId}`);
          }
        }
      }

      if (snapshot.memoryIdsLoaded && Array.isArray(snapshot.memoryIdsLoaded) && snapshot.memoryIdsLoaded.length > 0) {
        try {
          const allMemories = await storage.getAgentMemories(trace.agentId, "episodic", 100);
          const resolved = snapshot.memoryIdsLoaded.map((mid: string) => {
            const found = allMemories.find(m => m.id === mid);
            return { memoryId: mid, content: found?.content || null, stillAvailable: !!found, expired: !found };
          });
          available.memories = resolved;
        } catch { unavailable.push("memories"); }
      }

      if (snapshot.policySnapshot && Array.isArray(snapshot.policySnapshot)) {
        available.policies = [];
        for (const ps of snapshot.policySnapshot) {
          try {
            const policy = await storage.getPolicy(ps.policyId);
            available.policies.push({
              ...ps,
              currentStatus: policy?.status || "unknown",
              rules: (policy as any)?.rules || null,
              stillAvailable: !!policy,
            });
          } catch {
            available.policies.push({ ...ps, currentStatus: "unknown", stillAvailable: false });
          }
        }
      }

      if (snapshot.mcpToolFingerprints && typeof snapshot.mcpToolFingerprints === "object") {
        available.mcpTools = {};
        for (const [toolName, fingerprint] of Object.entries(snapshot.mcpToolFingerprints)) {
          available.mcpTools[toolName] = {
            executionTimeFingerprint: fingerprint,
          };
        }
        if (snapshot.mcpServerVersions && typeof snapshot.mcpServerVersions === "object") {
          for (const [serverId, serverInfo] of Object.entries(snapshot.mcpServerVersions)) {
            try {
              const server = await storage.getMcpServer(serverId);
              const tools = await storage.getMcpServerTools(serverId);
              for (const tool of tools) {
                if (available.mcpTools[tool.name]) {
                  available.mcpTools[tool.name].currentFingerprint = (tool as any).fingerprintHash || null;
                  available.mcpTools[tool.name].drifted = (tool as any).fingerprintHash !== available.mcpTools[tool.name].executionTimeFingerprint;
                  available.mcpTools[tool.name].inputSchema = tool.inputSchema;
                }
              }
            } catch {}
          }
        }
      }

      if (snapshot.contextProfileId) {
        try {
          const allProfiles = await storage.getContextProfiles();
          const cp = allProfiles.find(p => p.id === snapshot.contextProfileId);
          if (cp) {
            available.contextProfile = {
              id: cp.id,
              name: cp.name,
              executionTimeVersion: snapshot.contextProfileVersion,
              currentVersion: (cp as any).version,
              budgetAllocations: (cp as any).budgetAllocations,
              sources: cp.sources,
            };
          } else {
            unavailable.push("contextProfile");
          }
        } catch { unavailable.push("contextProfile"); }
      }

      available.autonomy = {
        level: snapshot.autonomyLevel || null,
        profileId: snapshot.autonomyProfileId || null,
      };
      available.industry = snapshot.industryContext || trace.agentId;
      available.ontologyConcepts = snapshot.ontologyConceptsUsed || [];

      res.json({
        traceId: trace.id,
        agentId: trace.agentId,
        executedAt: (snapshot.capturedAt || trace.startedAt),
        provenanceHash: trace.provenanceHash,
        available,
        unavailable,
        completeness: unavailable.length === 0 ? "full" : "partial",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/provenance/:traceId/diff", checkPermission("view_traces"), async (req, res) => {
    try {
      const trace = await storage.getTrace(req.params.traceId as string);
      if (!trace) return res.status(404).json({ error: "Trace not found" });

      const snapshot = (trace.provenanceSnapshot || {}) as any;
      const diffs: Array<{ component: string; atExecutionTime: any; currentState: any; changed: boolean; changeDetails?: string }> = [];

      if (snapshot.policySnapshot && Array.isArray(snapshot.policySnapshot)) {
        const currentPolicies = await storage.getPolicies(getOrgId(req));
        for (const ps of snapshot.policySnapshot) {
          const current = currentPolicies.find(p => p.id === ps.policyId);
          const changed = !current || current.status !== ps.status;
          diffs.push({
            component: `policy:${ps.policyName}`,
            atExecutionTime: { id: ps.policyId, status: ps.status, domain: ps.domain },
            currentState: current ? { id: current.id, status: current.status, domain: current.domain } : null,
            changed,
            changeDetails: !current ? "Policy deleted" : changed ? `Status changed: ${ps.status} → ${current.status}` : undefined,
          });
        }
      }

      if (snapshot.mcpToolFingerprints && typeof snapshot.mcpToolFingerprints === "object") {
        if (snapshot.mcpServerVersions) {
          for (const [serverId] of Object.entries(snapshot.mcpServerVersions)) {
            try {
              const tools = await storage.getMcpServerTools(serverId);
              for (const tool of tools) {
                const execFingerprint = snapshot.mcpToolFingerprints[tool.name];
                if (execFingerprint !== undefined) {
                  const currentFp = (tool as any).fingerprintHash || "";
                  const changed = execFingerprint !== currentFp;
                  diffs.push({
                    component: `mcpTool:${tool.name}`,
                    atExecutionTime: { fingerprint: execFingerprint },
                    currentState: { fingerprint: currentFp },
                    changed,
                    changeDetails: changed ? "Tool schema has drifted since execution" : undefined,
                  });
                }
              }
            } catch {}
          }
        }
      }

      if (snapshot.contextProfileId) {
        try {
          const allProfiles = await storage.getContextProfiles();
          const cp = allProfiles.find(p => p.id === snapshot.contextProfileId);
          const currentVersion = (cp as any)?.version || null;
          const changed = currentVersion !== snapshot.contextProfileVersion;
          diffs.push({
            component: "contextProfile",
            atExecutionTime: { id: snapshot.contextProfileId, version: snapshot.contextProfileVersion },
            currentState: cp ? { id: cp.id, version: currentVersion } : null,
            changed,
            changeDetails: !cp ? "Context profile deleted" : changed ? `Version changed: ${snapshot.contextProfileVersion} → ${currentVersion}` : undefined,
          });
        } catch {}
      }

      if (snapshot.blueprintId) {
        try {
          const blueprints = await storage.getBlueprints();
          const bp = blueprints.find(b => b.id === snapshot.blueprintId);
          if (bp) {
            const currentHash = nodeCrypto.createHash("sha256").update(canonicalJsonStringify(bp.blueprintJson || {})).digest("hex");
            const changed = snapshot.blueprintVersionHash && currentHash !== snapshot.blueprintVersionHash;
            diffs.push({
              component: "blueprint",
              atExecutionTime: { id: snapshot.blueprintId, versionHash: snapshot.blueprintVersionHash },
              currentState: { id: bp.id, versionHash: currentHash, version: bp.version },
              changed: !!changed,
              changeDetails: changed ? "Blueprint has been updated since execution" : undefined,
            });
          }
        } catch {}
      }

      res.json({
        traceId: trace.id,
        agentId: trace.agentId,
        executedAt: snapshot.capturedAt || trace.startedAt,
        diffs,
        totalComponents: diffs.length,
        changedComponents: diffs.filter(d => d.changed).length,
        driftDetected: diffs.some(d => d.changed),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/provenance/verify-integrity", async (req, res) => {
    try {
      const { traceIds } = req.body || {};
      let traces: any[];
      if (traceIds && Array.isArray(traceIds) && traceIds.length > 0) {
        traces = [];
        for (const tid of traceIds) {
          const t = await storage.getTrace(tid);
          if (t) traces.push(t);
        }
      } else {
        traces = await storage.getTraces(getOrgId(req));
      }

      const results = [];
      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const chainResult = await storage.verifyAuditChainIntegrity();

      for (const trace of traces) {
        const snapshot = trace.provenanceSnapshot as any;
        const storedHash = trace.provenanceHash;

        let snapshotHashMatch = false;
        if (snapshot && storedHash) {
          const recomputed = nodeCrypto.createHash("sha256")
            .update(canonicalJsonStringify(snapshot))
            .digest("hex");
          snapshotHashMatch = recomputed === storedHash;
        }

        let auditEventFound = false;
        if (trace.auditEventId) {
          auditEventFound = auditEvents.some(e => e.id === trace.auditEventId);
        }

        const hasProvenance = !!snapshot;
        results.push({
          traceId: trace.id,
          agentId: trace.agentId,
          hasProvenance,
          valid: hasProvenance ? (snapshotHashMatch && auditEventFound && chainResult.valid) : false,
          checks: {
            snapshotHashMatch: hasProvenance ? snapshotHashMatch : null,
            auditEventFound: trace.auditEventId ? auditEventFound : null,
            auditChainValid: chainResult.valid,
          },
        });
      }

      res.json({
        totalTraces: results.length,
        withProvenance: results.filter(r => r.hasProvenance).length,
        withoutProvenance: results.filter(r => !r.hasProvenance).length,
        allValid: results.filter(r => r.hasProvenance).every(r => r.valid),
        results,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/provenance/:traceId/export", checkPermission("view_traces"), async (req, res) => {
    try {
      const trace = await storage.getTrace(req.params.traceId as string);
      if (!trace) return res.status(404).json({ error: "Trace not found" });

      const format = (req.query.format as string) || "generic";
      const snapshot = (trace.provenanceSnapshot || {}) as any;

      const integritySection = {
        provenanceHash: trace.provenanceHash,
        auditEventId: trace.auditEventId,
        hashAlgorithm: "SHA-256",
        chainVerified: false as boolean,
      };
      try {
        if (trace.provenanceHash && trace.provenanceSnapshot) {
          const recomputed = nodeCrypto.createHash("sha256")
            .update(canonicalJsonStringify(trace.provenanceSnapshot))
            .digest("hex");
          integritySection.chainVerified = recomputed === trace.provenanceHash;
        }
      } catch {}

      let chainOfCustody: any[] = [];
      try {
        const events = await storage.getAuditEvents(getOrgId(req));
        const sorted = events
          .filter(e => e.sequenceNum !== null)
          .sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));
        if (trace.auditEventId) {
          const targetIdx = sorted.findIndex(e => e.id === trace.auditEventId);
          if (targetIdx >= 0) {
            chainOfCustody = sorted.slice(Math.max(0, targetIdx - 5), targetIdx + 1).map(e => ({
              sequenceNum: e.sequenceNum,
              eventHash: e.eventHash,
              action: e.action,
              timestamp: e.createdAt,
            }));
          }
        }
      } catch {}

      const baseExport = {
        exportFormat: format,
        exportedAt: new Date().toISOString(),
        traceId: trace.id,
        agentId: trace.agentId,
        executedAt: snapshot.capturedAt || trace.startedAt,
        tamperEvidence: integritySection,
        chainOfCustody,
      };

      if (format === "sec") {
        const kbSources = (snapshot.kbRetrievals || []).flatMap((kbr: any) =>
          (kbr.chunks || []).map((c: any) => ({ kbName: kbr.kbName, chunkId: c.chunkId, sourceDocId: c.sourceDocId, similarity: c.similarityScore }))
        );
        res.json({
          ...baseExport,
          title: "Investment Decision Reconstruction",
          agentIdentity: { agentId: trace.agentId, versionId: trace.versionId, industry: snapshot.industryContext },
          decisionTimestamp: snapshot.capturedAt || trace.startedAt,
          modelUsed: trace.modelId || "claude-opus-4-5",
          dataSources: kbSources,
          reasoningChain: (trace.stepsJson as any[])?.filter((s: any) => s.type === "ai_analysis" || s.type === "ai_planning").map((s: any) => ({ step: s.name, output: s.output })) || [],
          riskFactors: (trace.stepsJson as any[])?.find((s: any) => s.type === "compliance_check")?.output || {},
          policiesApplied: snapshot.policySnapshot || [],
          autonomyLevel: snapshot.autonomyLevel || "unknown",
          tokenUsage: trace.tokenUsage,
          costUsd: trace.costUsd,
        });
      } else if (format === "hipaa") {
        res.json({
          ...baseExport,
          title: "PHI Access Audit",
          accessingAgent: { agentId: trace.agentId, versionId: trace.versionId },
          dataAccessed: (snapshot.kbRetrievals || []).map((kbr: any) => ({
            knowledgeBase: kbr.kbName,
            chunksAccessed: (kbr.chunks || []).length,
            embeddingModel: kbr.embeddingModel,
          })),
          governingPolicies: snapshot.policySnapshot || [],
          autonomyLevel: snapshot.autonomyLevel || "unknown",
          minimumNecessary: {
            chunksRetrieved: (snapshot.kbRetrievals || []).reduce((sum: number, kbr: any) => sum + (kbr.chunks || []).length, 0),
            memoriesLoaded: (snapshot.memoryIdsLoaded || []).length,
          },
          retentionPolicy: snapshot.policySnapshot?.find((p: any) => p.domain === "retention") || null,
        });
      } else if (format === "insurance") {
        res.json({
          ...baseExport,
          title: "Claims Decision Reconstruction",
          claimContext: {
            agentId: trace.agentId,
            industry: snapshot.industryContext,
            autonomyLevel: snapshot.autonomyLevel,
          },
          rulesApplied: snapshot.policySnapshot || [],
          supportingDocuments: (snapshot.kbRetrievals || []).flatMap((kbr: any) =>
            (kbr.chunks || []).map((c: any) => ({ source: kbr.kbName, docId: c.sourceDocId, confidence: c.similarityScore }))
          ),
          reasoningSteps: (trace.stepsJson as any[])?.map((s: any) => ({ step: s.name, type: s.type, status: s.status })) || [],
          escalationTriggers: snapshot.policySnapshot?.filter((p: any) => p.domain === "escalation") || [],
          humanOversight: {
            autonomyLevel: snapshot.autonomyLevel,
            requiresApproval: snapshot.autonomyLevel === "expert_approval" || snapshot.autonomyLevel === "confirm_before",
          },
        });
      } else {
        res.json({
          ...baseExport,
          title: "Full Provenance Export",
          provenanceSnapshot: snapshot,
          traceDetails: {
            status: trace.status,
            latencyMs: trace.latencyMs,
            costUsd: trace.costUsd,
            modelId: trace.modelId,
            tokenUsage: trace.tokenUsage,
            inputSummary: trace.inputSummary,
            outputSummary: trace.outputSummary,
          },
          steps: trace.stepsJson,
          toolCalls: trace.toolCalls,
          policyChecks: trace.policyChecks,
          retrievedDocs: trace.retrievedDocs,
        });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/provenance/batch-export", async (req, res) => {
    try {
      const { traceIds, format, dateRange } = req.body || {};
      const exportFormat = format || "generic";
      let traces: any[];

      if (traceIds && Array.isArray(traceIds) && traceIds.length > 0) {
        traces = [];
        for (const tid of traceIds) {
          const t = await storage.getTrace(tid);
          if (t) traces.push(t);
        }
      } else {
        traces = await storage.getTraces(getOrgId(req));
        if (dateRange) {
          const { start, end } = dateRange;
          if (start) traces = traces.filter(t => new Date(t.createdAt || 0) >= new Date(start));
          if (end) traces = traces.filter(t => new Date(t.createdAt || 0) <= new Date(end));
        }
      }

      const exports = traces.map(trace => {
        const snapshot = (trace.provenanceSnapshot || {}) as any;
        return {
          traceId: trace.id,
          agentId: trace.agentId,
          executedAt: snapshot.capturedAt || trace.startedAt,
          status: trace.status,
          provenanceHash: trace.provenanceHash,
          auditEventId: trace.auditEventId,
          hasProvenance: !!trace.provenanceSnapshot,
          industry: snapshot.industryContext || null,
          autonomyLevel: snapshot.autonomyLevel || null,
          kbRetrievalCount: (snapshot.kbRetrievals || []).length,
          policyCount: (snapshot.policySnapshot || []).length,
          toolCount: Object.keys(snapshot.mcpToolFingerprints || {}).length,
          memoryCount: (snapshot.memoryIdsLoaded || []).length,
          latencyMs: trace.latencyMs,
          costUsd: trace.costUsd,
        };
      });

      res.json({
        exportFormat,
        exportedAt: new Date().toISOString(),
        totalTraces: exports.length,
        withProvenance: exports.filter(e => e.hasProvenance).length,
        records: exports,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/deployments", async (req, res) => {
    const deployments = await storage.getDeployments(getOrgId(req));
    res.json(deployments);
  });

  // Freeze/freeze-status (above) previously only recorded that something was
  // frozen -- nothing ever checked it before create/promote/routing actions,
  // so a freeze was purely advisory. This mirrors freeze-status's own
  // org-wide-then-agent-scoped lookup so the two stay consistent.

  router.post("/api/deployments", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const r = await createDeploymentAction({ orgId: getOrgId(req) }, req.body ?? {});
      res.status(r.status).json(r.body);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/deployments/health", async (req, res) => {
    try {
      const orgId = getOrgId(req);
      const deployments = await storage.getDeployments(orgId);
      const traces = await storage.getTraces(orgId);
      const activeDeployments = deployments.filter(d => d.status === "deployed" || d.status === "active" || d.status === "canary");

      const health: Record<string, { successRate: number; avgLatency: number; errorCount: number; traceCount: number }> = {};

      for (const dep of activeDeployments) {
        const agentTraces = traces.filter(t => t.agentId === dep.agentId).slice(0, 30);
        const total = agentTraces.length;
        const failed = agentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const avgLat = total > 0 ? Math.round(agentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / total) : 0;

        if (!health[dep.environment]) {
          health[dep.environment] = { successRate: 0, avgLatency: 0, errorCount: 0, traceCount: 0 };
        }
        const env = health[dep.environment];
        env.traceCount += total;
        env.errorCount += failed;
        env.avgLatency = total > 0 ? Math.round((env.avgLatency * (env.traceCount - total) + avgLat * total) / env.traceCount) : env.avgLatency;
        env.successRate = env.traceCount > 0 ? ((env.traceCount - env.errorCount) / env.traceCount) * 100 : 100;
      }

      res.json(health);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/deployments/freeze-status", async (req, res) => {
    try {
      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const freezeEvents = auditEvents.filter(
        (e) => e.action === "deployment_freeze" || e.action === "deployment_unfreeze"
      );
      const statusMap: Record<string, any> = {};
      for (const evt of freezeEvents) {
        try {
          const details = JSON.parse(evt.details || "{}");
          const key = details.targetId || details.scope || "unknown";
          if (evt.action === "deployment_freeze") {
            statusMap[key] = {
              frozen: true,
              scope: details.scope,
              reason: details.reason,
              frozenBy: evt.actorId,
              frozenAt: evt.createdAt,
            };
          } else if (evt.action === "deployment_unfreeze") {
            delete statusMap[key];
          }
        } catch {}
      }
      res.json(statusMap);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/freeze", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const { action, scope, targetId, reason } = req.body;
      if (!action || !scope) {
        return res.status(400).json({ message: "action and scope are required" });
      }

      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:deployment_${action}:${targetId || scope}:${Date.now()}`;
      const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

      const auditEvent = await storage.createAuditEvent({
        actorType: "user",
        actorId: "operator",
        action: action === "freeze" ? "deployment_freeze" : "deployment_unfreeze",
        objectType: "deployment",
        objectId: targetId || scope,
        details: JSON.stringify({
          scope,
          targetId: targetId || scope,
          reason: reason || "",
          action,
        }),
        sequenceNum: maxSeq + 1,
        previousHash: lastHash,
        eventHash,
        ontologyTags: resolveOntologyTags("deployment", action === "freeze" ? "deployment_freeze" : "deployment_unfreeze", { details: reason || "" }),
      });

      res.json({ success: true, event: auditEvent });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/deployments/:id", async (req, res) => {
    const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
    if (!deployment) return res.status(404).json({ message: "Deployment not found" });
    res.json(deployment);
  });

  // Per-deployment routes are org-scoped by deploymentScope (server/tenant-scope.ts).
  router.patch("/api/deployments/:id", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const existing = await storage.getDeployment(req.params.id as string, getOrgId(req));
      if (!existing) return res.status(404).json({ message: "Deployment not found" });
      const data = insertDeploymentSchema.partial().parse(req.body);
      // Promotion is what moves a deployment between environments, and it runs
      // the gates and files an approval. A raw edit must not do it quietly.
      if (data.environment && data.environment !== existing.environment) {
        return res.status(400).json({ message: "Use promote to move a deployment between environments." });
      }
      const goesLive = ["deployed", "active", "canary"].includes(String(data.status ?? ""));
      if (goesLive && existing.environment === "prod" && !hasPermission(getRequestRole(req), "deploy_prod")) {
        return res.status(403).json({ message: "Taking a production deployment live needs deploy_prod." });
      }
      const updated = await storage.updateDeployment((req.params.id as string), data, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Deployment not found" });

      if (req.body.status === "active" && existing.status !== "active") {
        const agent = await storage.getAgent(existing.agentId, getOrgId(req));
        const srcTplId = agent?.sourceTemplateId || (agent?.runtimeConfig as any)?.sourceTemplateId;
        if (srcTplId) {
          await storage.incrementTemplateDeployments(srcTplId);
        }
      }

      // Auto-generate/refresh AAR config when deployment transitions to deployed/active
      const newStatus = req.body.status;
      const wasAlreadyLive = existing.status === "deployed" || existing.status === "active";
      if ((newStatus === "deployed" || newStatus === "active") && !wasAlreadyLive) {
        ensureAarConfig(existing.agentId).catch(() => {});
      }

      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/initialize-pipeline", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const deployment = await storage.getDeployment((req.params.id as string), getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });
      const { industry, stages, rollbackTriggers, evidenceItems } = req.body;
      const stageRecords = (stages || []).map((s: any) => ({
        stageId: s.id,
        status: "pending",
        artifacts: [],
      }));
      const evidenceRecords = (evidenceItems || []).map((e: any) => ({
        itemId: e.id,
        collected: false,
      }));
      const updated = await storage.updateDeployment((req.params.id as string), {
        industry: industry || null,
        pipelineStages: stageRecords,
        industryRollbackTriggers: rollbackTriggers || [],
        evidencePackage: evidenceRecords,
        pipelineComplete: false,
      }, getOrgId(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/advance-stage", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const deployment = await storage.getDeployment((req.params.id as string), getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });
      const { stageId, status, attestation, completedBy } = req.body;
      if (!stageId || !status) return res.status(400).json({ message: "stageId and status are required" });
      const stages = (deployment.pipelineStages as any[]) || [];
      const idx = stages.findIndex((s: any) => s.stageId === stageId);
      if (idx === -1) return res.status(404).json({ message: "Stage not found" });
      stages[idx] = {
        ...stages[idx],
        status,
        // Who signed off is the signed-in person, not whoever the request claims.
        ...(status === "completed" ? { completedAt: new Date().toISOString(), completedBy: getRequestActorLabel(req), attestation } : {}),
      };
      const allComplete = stages.every((s: any) => s.status === "completed" || s.status === "skipped");
      const updated = await storage.updateDeployment((req.params.id as string), {
        pipelineStages: stages,
        pipelineComplete: allComplete,
      }, getOrgId(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/collect-evidence", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const deployment = await storage.getDeployment((req.params.id as string), getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });
      const { itemId, sourceLink, summary } = req.body;
      if (!itemId) return res.status(400).json({ message: "itemId is required" });
      const evidence = (deployment.evidencePackage as any[]) || [];
      const idx = evidence.findIndex((e: any) => e.itemId === itemId);
      if (idx === -1) return res.status(404).json({ message: "Evidence item not found" });
      evidence[idx] = {
        ...evidence[idx],
        collected: true,
        collectedAt: new Date().toISOString(),
        sourceLink: sourceLink || null,
        summary: summary || null,
      };
      const updated = await storage.updateDeployment((req.params.id as string), {
        evidencePackage: evidence,
      }, getOrgId(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/promote", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      // deploy_prod was defined but never checked on the server: a role with
      // staging rights could promote all the way into production.
      const current = await storage.getDeployment(req.params.id as string, getOrgId(req));
      const target = current?.environment === "staging" ? "pilot" : current?.environment === "pilot" ? "prod" : null;
      if (target === "prod" && !hasPermission(getRequestRole(req), "deploy_prod")) {
        return res.status(403).json({ message: "Promoting into production needs deploy_prod." });
      }
      const r = await promoteDeploymentAction({ orgId: getOrgId(req) }, req.params.id as string, req.body ?? {});
      res.status(r.status).json(r.body);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/routing", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const r = await changeRoutingAction({ orgId: getOrgId(req) }, req.params.id as string, req.body ?? {});
      res.status(r.status).json(r.body);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/deployments/:id/readiness", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const agentId = deployment.agentId;
      const traces = await storage.getTracesByAgent(agentId, getOrgId(req));
      const evalSuites = await storage.getEvalSuites();
      const agentSuites = evalSuites.filter(s => s.agentId === agentId);
      const agentDrift: Array<{ agentId: string; metric: string; driftPercent: number; severity: string }> = [];
      const allSuites = evalSuites;
      for (const suite of allSuites.filter(s => s.agentId === agentId)) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        if (runs.length < 2) continue;
        const sorted = [...runs].sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
        const latest = sorted[0];
        const previous = sorted.slice(1, 6);
        if (previous.length === 0) continue;
        const baselinePassRate = previous.reduce((sum, r) => sum + (r.passRate || 0), 0) / previous.length;
        const currentPassRate = latest.passRate || 0;
        if (baselinePassRate > 0) {
          const driftPct = ((baselinePassRate - currentPassRate) / baselinePassRate) * 100;
          if (Math.abs(driftPct) > 2) {
            agentDrift.push({
              agentId: suite.agentId,
              metric: "pass_rate",
              driftPercent: Math.round(driftPct * 100) / 100,
              severity: Math.abs(driftPct) > 15 ? "critical" : Math.abs(driftPct) > 8 ? "high" : Math.abs(driftPct) > 4 ? "medium" : "low",
            });
          }
        }
      }

      const recentTraces = traces.slice(0, 50);
      const totalTraces = recentTraces.length;
      const failedTraces = recentTraces.filter(t => t.status === "failed" || t.status === "error");
      const successRate = totalTraces > 0 ? ((totalTraces - failedTraces.length) / totalTraces) * 100 : 100;
      const avgLatency = totalTraces > 0
        ? Math.round(recentTraces.reduce((sum, t) => sum + (t.latencyMs || 0), 0) / totalTraces)
        : 0;

      const agent = await storage.getAgent(agentId, getOrgId(req));
      const rtConfig = (agent?.runtimeConfig as Record<string, any>) || {};
      const gateOverrides = rtConfig.promotionGateOverrides || {};

      const evalPassThreshold = typeof gateOverrides.minEvalPassRate === "number" ? gateOverrides.minEvalPassRate : 80;
      const evalWarnThreshold = Math.max(0, evalPassThreshold * 0.75);
      const latencyPassThreshold = typeof gateOverrides.maxLatencyMs === "number" ? gateOverrides.maxLatencyMs : 2000;
      const latencyWarnThreshold = typeof gateOverrides.maxLatencyWarnMs === "number" ? gateOverrides.maxLatencyWarnMs : Math.max(latencyPassThreshold, 5000);

      const minEvalPassRate = agentSuites.length > 0
        ? Math.min(...agentSuites.map(s => s.passRate ?? 0))
        : null;
      const failingSuiteNames = agentSuites.filter(s => (s.passRate ?? 0) < evalPassThreshold).map(s => s.name);

      const criticalDrift = agentDrift.filter((d: any) => d.severity === "critical");
      const highDrift = agentDrift.filter((d: any) => d.severity === "high");

      const evalStatus = minEvalPassRate === null ? "unknown"
        : evalPassThreshold === 0 ? "pass"
        : minEvalPassRate >= evalPassThreshold ? "pass"
        : minEvalPassRate >= evalWarnThreshold ? "warn" : "fail";

      const checks = [
        {
          name: "Eval Pass Rate",
          status: evalStatus,
          value: minEvalPassRate !== null ? `${minEvalPassRate.toFixed(1)}%` : "No evals",
          detail: failingSuiteNames.length > 0 ? `Failing: ${failingSuiteNames.join(", ")}` : agentSuites.length > 0 ? `${agentSuites.length} suite(s) passing` : "No eval suite found",
          enforced: evalPassThreshold > 0,
          threshold: evalPassThreshold,
        },
        {
          name: "Success Rate",
          status: successRate >= 95 ? "pass" : successRate >= 85 ? "warn" : "fail",
          value: `${successRate.toFixed(1)}%`,
          detail: `${totalTraces} recent traces, ${failedTraces.length} failed`,
        },
        {
          name: "Drift Status",
          status: criticalDrift.length > 0 ? "fail" : highDrift.length > 0 ? "warn" : "pass",
          value: criticalDrift.length > 0 ? `${criticalDrift.length} critical` : highDrift.length > 0 ? `${highDrift.length} high` : "Stable",
          detail: agentDrift.length > 0 ? agentDrift.map((d: any) => `${d.metric}: ${d.driftPercent.toFixed(1)}%`).slice(0, 3).join(", ") : "No drift detected",
        },
        {
          name: "Avg Latency",
          status: avgLatency <= latencyPassThreshold ? "pass" : avgLatency <= latencyWarnThreshold ? "warn" : "fail",
          value: `${avgLatency}ms`,
          detail: avgLatency <= latencyPassThreshold ? "Within threshold" : avgLatency <= latencyWarnThreshold ? "Elevated" : "Exceeds threshold",
          threshold: latencyPassThreshold,
        },
        {
          name: "Error Rate",
          status: failedTraces.length === 0 ? "pass" : failedTraces.length <= 2 ? "warn" : "fail",
          value: totalTraces > 0 ? `${((failedTraces.length / totalTraces) * 100).toFixed(1)}%` : "0%",
          detail: `${failedTraces.length} failures in last ${totalTraces} runs`,
        },
      ];

      const outcomes = await storage.getOutcomes(getOrgId(req));
      const boundOutcomes = outcomes.filter(o => {
        const agents = (o.attributionRules as any)?.agents;
        if (Array.isArray(agents)) return agents.some((a: any) => a.agentId === agentId);
        return false;
      });
      const allAgents = await storage.getAgents(getOrgId(req));
      const invoices = await storage.getInvoices();
      const agentInvoices = invoices.filter(inv => boundOutcomes.some(o => o.id === inv.outcomeId));
      const revenueExposure = agentInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      const downstreamCount = allAgents.filter(a => a.id !== agentId && boundOutcomes.some(o => {
        const attrs = (o.attributionRules as any)?.agents;
        return Array.isArray(attrs) && attrs.some((at: any) => at.agentId === a.id);
      })).length;

      // Counted from rows (server/blast-radius.ts). This used to project
      // "runs per day" from the last 50 traces as though they spanned a week,
      // and fall back to "~15m" for rollback with nothing behind it.
      const blastRadius = buildBlastRadius({
        environment: deployment.environment,
        traces: recentTraces,
        boundOutcomes,
        revenueExposureUsd: agentInvoices.length > 0 ? revenueExposure : null,
        downstreamAgents: downstreamCount,
        rollbackCooldownMinutes: (deployment.rollbackConfig as any)?.cooldownMinutes ?? null,
      });

      let ontologyCheck: any = { enforced: true, status: "pass", lowAlignmentTools: [] };
      try {
        const blueprints = await storage.getBlueprints();
        const agentBlueprint = blueprints.find(b => b.agentId === agentId);
        if (agentBlueprint) {
          const bpJson = agentBlueprint.blueprintJson as any;
          const bpNodes = bpJson?.nodes || [];
          const toolNodes = bpNodes.filter((n: any) => {
            const nodeType = (n.type || n.data?.type || "").toLowerCase();
            return nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action");
          });
          const requiredToolNames = toolNodes.map((n: any) => n.data?.toolName || n.data?.tool || n.toolName || n.label || n.id || "unknown");
          const mcpLinks = await storage.getAgentMcpServers(agentId);
          const agentMcpServerIds = mcpLinks.map(l => l.serverId);
          const ontologyToolResults: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }> = [];

          for (const serverId of agentMcpServerIds) {
            const server = await storage.getMcpServer(serverId);
            if (!server) continue;
            const serverTools = await storage.getMcpServerTools(serverId);
            const matches = await storage.getMcpParameterMatches(serverId);

            for (const tool of serverTools) {
              const isReferenced = requiredToolNames.length === 0 || requiredToolNames.some((name: string) =>
                name.toLowerCase().includes(tool.name.toLowerCase()) ||
                tool.name.toLowerCase().includes(name.toLowerCase())
              );
              if (!isReferenced) continue;
              const toolMatches = matches.filter(m => m.toolName === tool.name);
              const matchedCount = toolMatches.filter(m => m.matchStatus === "matched" || m.matchStatus === "partial").length;
              const totalCount = toolMatches.length;
              const score = totalCount > 0 ? matchedCount / totalCount : 0;
              if (score < 0.5) {
                ontologyToolResults.push({
                  toolName: tool.name,
                  serverName: server.name,
                  score: Math.round(score * 100) / 100,
                  matched: matchedCount,
                  total: totalCount,
                });
              }
            }
          }

          if (ontologyToolResults.length > 0) {
            ontologyCheck = {
              enforced: true,
              status: "fail",
              lowAlignmentTools: ontologyToolResults,
              message: `${ontologyToolResults.length} tool(s) below 50% ontology alignment threshold`,
            };
            checks.push({
              name: "Ontology Alignment",
              status: "fail" as any,
              value: `${ontologyToolResults.length} tool(s) below threshold`,
              detail: ontologyToolResults.map(t => `${t.toolName}: ${Math.round(t.score * 100)}%`).join(", "),
              enforced: true,
              threshold: undefined,
            });
          } else {
            checks.push({
              name: "Ontology Alignment",
              status: "pass" as any,
              value: "All tools aligned",
              detail: "All referenced tools meet 50% ontology alignment threshold",
              enforced: true,
              threshold: undefined,
            });
          }
        }
      } catch {}

      const finalOverallStatus = checks.some(c => c.status === "fail") ? "blocked" : checks.some(c => c.status === "warn") ? "warning" : "ready";

      res.json({ checks, overallStatus: finalOverallStatus, blastRadius, agentName: agent?.name || "Unknown", ontologyCheck });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/rollback", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const r = await rollbackDeploymentAction({ orgId: getOrgId(req) }, req.params.id as string, req.body ?? {});
      res.status(r.status).json(r.body);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Fix #4: External / webhook trigger — any authenticated caller can fire a deployed agent on-demand
  router.post("/api/deployments/:id/trigger", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });
      if (!["active", "deployed", "canary"].includes(deployment.status || "")) {
        return res.status(400).json({ message: `Deployment is not active (status: ${deployment.status})` });
      }
      const { prompt, triggeredBy = "webhook" } = (req.body as { prompt?: string; triggeredBy?: string }) || {};
      const result = await runAgentOnce(deployment.id, prompt || undefined, undefined, undefined, triggeredBy);
      res.json({ triggered: true, deploymentId: deployment.id, ...result });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/auto-promote", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const deployment = await storage.getDeployment((req.params.id as string), getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      if (deployment.environment !== "staging") {
        return res.status(400).json({ message: "Auto-promote is only available for staging deployments" });
      }

      const agent = await storage.getAgent(deployment.agentId, getOrgId(req));
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL") {
        return res.status(400).json({
          message: `Auto-promote blocked: agent risk tier is ${agent.riskTier}. Manual promotion required.`,
          eligible: false,
        });
      }

      const traces = await storage.getTracesByAgent(deployment.agentId, getOrgId(req));
      const sortedTraces = [...traces].sort((a, b) =>
        new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
      );
      const recentTraces = sortedTraces.slice(0, 30);
      const totalT = recentTraces.length;
      const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;

      const evalSuites = await storage.getEvalSuites();
      const agentSuites = evalSuites.filter(s => s.agentId === deployment.agentId);
      let latestPassRate = 0;
      for (const suite of agentSuites) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        if (runs.length > 0) {
          const sorted = [...runs].sort((a, b) =>
            new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
          );
          latestPassRate = Math.max(latestPassRate, sorted[0].passRate || 0);
        }
      }

      const autoPromoteRtConfig = (agent.runtimeConfig as Record<string, any>) || {};
      const autoPromoteGateOverrides = autoPromoteRtConfig.promotionGateOverrides || {};
      const autoPromoteEvalThreshold = typeof autoPromoteGateOverrides.minEvalPassRate === "number" ? autoPromoteGateOverrides.minEvalPassRate : 80;

      if (successRate < 95 || (autoPromoteEvalThreshold > 0 && agentSuites.length > 0 && latestPassRate < autoPromoteEvalThreshold)) {
        return res.status(400).json({
          message: "Auto-promote blocked: readiness checks not passing",
          eligible: false,
          checks: {
            successRate: { value: successRate.toFixed(1), threshold: 95, pass: successRate >= 95 },
            evalPassRate: { value: latestPassRate.toFixed(1), threshold: 80, pass: latestPassRate >= 80 },
          },
        });
      }

      await storage.updateDeployment(deployment.id, { status: "promoted", promotedAt: new Date() }, getOrgId(req));

      // "Auto" refers to the readiness checks above deciding when to promote,
      // not to skipping the gates. The pilot deployment is created pending, so
      // the same approval as a manual promotion has to be decided first.
      const promoted = await storage.createDeployment({
        agentId: deployment.agentId,
        agentName: deployment.agentName,
        environment: "pilot",
        versionId: deployment.versionId,
        version: deployment.version,
        status: "pending",
        canaryPercent: deployment.canaryConfig ? (deployment.canaryConfig as any).startPercent || 0 : 0,
        rolloutStrategy: deployment.rolloutStrategy,
        approvedBy: "System (Auto-Promote)",
        organizationId: deployment.organizationId ?? undefined,
        signatureHash: deployment.signatureHash,
        promotedFrom: deployment.id,
        canaryConfig: deployment.canaryConfig as any,
        rollbackConfig: deployment.rollbackConfig as any,
        deployedAt: new Date(),
      });

      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:auto_promote:${deployment.id}:${Date.now()}`;
      const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "release-service",
        action: "deployment_auto_promoted",
        objectType: "deployment",
        objectId: promoted.id,
        details: JSON.stringify({
          fromEnvironment: "staging",
          toEnvironment: "pilot",
          agentName: deployment.agentName,
          version: deployment.version,
          riskTier: agent.riskTier,
          successRate: successRate.toFixed(1) + "%",
          evalPassRate: latestPassRate.toFixed(1) + "%",
        }),
        sequenceNum: maxSeq + 1,
        previousHash: lastHash,
        eventHash,
      });

      res.status(201).json({ promoted, autoPromoted: true });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // The legacy eval tables have no organization column: a suite belongs to its
  // agent's organization, a run to its own agent or its suite's (evalSuiteScope /
  // evalRunScope in server/tenant-scope.ts).
  router.get("/api/evals", async (req, res) => {
    const suites = await filterEvalSuitesForOrg(await storage.getEvalSuites(), resolveRequestOrgId(req));
    res.json(suites);
  });

  router.get("/api/eval-runs", async (req, res) => {
    const runs = await filterEvalRunsForOrg(await storage.getAllEvalRuns(), resolveRequestOrgId(req));
    res.json(runs);
  });

  router.get("/api/eval/results", async (req, res) => {
    const skillId = req.query.skill_id as string;
    if (!skillId) return res.status(400).json({ error: "skill_id query parameter is required" });

    const latestRun = await storage.getLatestEvalRunBySkill(skillId);
    if (!latestRun) return res.json({ run: null, caseResults: [], failingCases: [] });

    const caseResults = await storage.getEvalCaseResults(latestRun.id);
    const failingCases = caseResults.filter(r => !r.passed);
    // Runs surfaced here are always produced by the self-graded/simulated
    // POST /api/skills/:id/eval/run flow (see its docstring) -- flag that
    // explicitly so the UI doesn't present it as a real sandboxed test run.
    res.json({ run: latestRun, caseResults, failingCases, mode: "simulated", selfGraded: true });
  });

  // Self-graded / simulated eval: for each test case, a single LLM call is asked to
  // *imagine* how the skill would behave for the given input and then judge its own
  // imagined output against the expected criteria. The skill's real instructions are
  // never actually injected into a live agent run and no tools are dispatched, so this
  // is NOT the same as the real, sandboxed execution done by
  // POST /api/ai/skill-test-sandbox (server/routes/skills.ts), which runs the scenario
  // against the live model with the real skill-context block and grades that real
  // output. Callers/UI must treat this endpoint's results as simulated, not as a
  // verified sandbox run.
  router.post("/api/skills/:id/eval/run", async (req, res) => {
    try {
      const skillId = req.params.id;
      const skill = await storage.getSkill(skillId);
      if (!skill) return res.status(404).json({ error: "Skill not found" });

      let suites = await storage.getEvalSuitesBySkill(skillId);
      let suite: typeof suites[0];
      if (suites.length === 0) {
        suite = await storage.createEvalSuite({
          agentId: "system",
          skillId,
          name: `${skill.name} Eval Suite`,
          type: "skill_eval",
          passRate: 0,
          totalCases: 0,
          industry: skill.industry,
        });

        const testCaseTemplates = [
          { name: `${skill.name} - Happy Path`, inputData: { scenario: "standard_input", skillName: skill.name }, expectedOutput: { status: "success" }, tags: ["happy_path", skill.domain] },
          { name: `${skill.name} - Edge Case`, inputData: { scenario: "edge_case", skillName: skill.name }, expectedOutput: { status: "handled" }, tags: ["edge_case", skill.domain] },
          { name: `${skill.name} - Error Handling`, inputData: { scenario: "invalid_input", skillName: skill.name }, expectedOutput: { status: "error_handled" }, tags: ["error_handling", skill.domain] },
          { name: `${skill.name} - Performance`, inputData: { scenario: "performance_test", skillName: skill.name }, expectedOutput: { status: "within_sla" }, tags: ["performance", skill.domain] },
          { name: `${skill.name} - Compliance Check`, inputData: { scenario: "compliance_validation", skillName: skill.name, industry: skill.industry }, expectedOutput: { status: "compliant" }, tags: ["compliance", skill.industry, skill.domain] },
        ];
        for (const tc of testCaseTemplates) {
          await storage.createEvalTestCase({ suiteId: suite.id, ...tc, weight: 1, status: "active", origin: "auto_generated" });
        }
      } else {
        suite = suites[0];
      }

      const testCases = await storage.getEvalTestCases(suite.id);
      const totalCases = testCases.length;

      const run = await storage.createEvalRun({
        suiteId: suite.id,
        agentId: "system",
        skillId,
        status: "running",
        totalCases,
        passedCases: 0,
        failedCases: 0,
        passRate: 0,
        avgLatencyMs: 0,
        avgCostUsd: 0,
        triggeredBy: "manual",
        environment: "staging",
      });

      let passedCount = 0;
      let failedCount = 0;
      let totalLatencyMs = 0;
      let totalCostUsd = 0;

      for (const tc of testCases) {
        const caseStart = Date.now();
        let actualOutput: any = {};
        let passed = false;
        let failingStep: string | null = null;
        let failingReason: string | null = null;
        let costUsd = 0;

        try {
          const evalPrompt = `You are evaluating a skill called "${skill.name}" (domain: ${skill.domain || "general"}, industry: ${skill.industry || "general"}).

Skill description: ${skill.description || "No description"}
${(skill as any).instructions ? `Skill instructions: ${(skill as any).instructions}` : ""}

Test case: "${tc.name}"
Input scenario: ${JSON.stringify(tc.inputData)}
Expected output criteria: ${JSON.stringify(tc.expectedOutput)}

Execute this test case by simulating the skill's behavior with the given input. Then evaluate whether the output meets the expected criteria.

Respond in JSON format:
{
  "status": "success" | "failure",
  "output": { ... your simulated output ... },
  "reasoning": "Why this passed or failed",
  "meetsExpectations": true | false,
  "qualityScore": 0.0 to 1.0
}`;

          const rawContent = await callClaude({
            system: "",
            user: evalPrompt,
            model: "claude-haiku-4-5",
            maxTokens: 1024,
            jsonMode: true,
          });
          costUsd = 0.001;

          try {
            actualOutput = JSON.parse(stripJsonFences(rawContent));
          } catch {
            actualOutput = { raw: rawContent };
          }

          passed = actualOutput.meetsExpectations === true || actualOutput.status === "success";
          if (!passed) {
            failingStep = "ai_evaluation";
            failingReason = actualOutput.reasoning || `Output did not meet expected criteria: ${JSON.stringify(tc.expectedOutput)}`;
          }
        } catch (evalErr: any) {
          actualOutput = { error: evalErr.message };
          failingStep = "execution_error";
          failingReason = `Eval execution failed: ${evalErr.message}`;
        }

        const latencyMs = Date.now() - caseStart;
        totalLatencyMs += latencyMs;
        totalCostUsd += costUsd;
        if (passed) passedCount++; else failedCount++;

        await storage.createEvalCaseResult({
          runId: run.id,
          caseId: tc.id,
          passed,
          actualOutput: actualOutput as any,
          failingStep,
          failingReason,
          latencyMs,
          costUsd: parseFloat(costUsd.toFixed(6)),
        });
      }

      const passRate = totalCases > 0 ? parseFloat((passedCount / totalCases * 100).toFixed(1)) : 0;
      const avgLatencyMs = totalCases > 0 ? Math.round(totalLatencyMs / totalCases) : 0;
      const avgCostUsd = totalCases > 0 ? parseFloat((totalCostUsd / totalCases).toFixed(6)) : 0;

      await storage.updateEvalRun(run.id, {
        status: "completed",
        passedCases: passedCount,
        failedCases: failedCount,
        passRate,
        avgLatencyMs,
        avgCostUsd,
        completedAt: new Date(),
      });

      await storage.updateSkill(skillId, {
        lastEvalPassRate: passRate,
        lastEvalAt: new Date(),
        // Keep the catalog's "performance" sort/telemetry in sync with the
        // latest measured eval outcome instead of leaving it perpetually 0.
        performanceScore: passRate,
      });

      const caseResults = await storage.getEvalCaseResults(run.id);
      res.json({
        run,
        caseResults,
        failingCases: caseResults.filter(r => !r.passed),
        // Each case is graded by asking the model to simulate the skill's behavior and
        // then judge that simulated output -- no real skill execution or tool dispatch
        // occurs. Distinct from the real sandbox run at POST /api/ai/skill-test-sandbox.
        mode: "simulated",
        selfGraded: true,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to run skill eval" });
    }
  });

  router.post("/api/evals", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertEvalSuiteSchema.parse(req.body);
      // A suite takes its organization from its agent, so the agent must be the caller's.
      const owner = data.agentId ? await storage.getAgent(data.agentId, getOrgId(req)) : undefined;
      if (data.agentId && !owner) return res.status(404).json({ message: "Agent not found" });
      const suite = await storage.createEvalSuite(data);
      res.status(201).json(suite);
      // Fire-and-forget: auto-populate ontology-grounded test cases if the agent has concepts
      if (suite.agentId) {
        generateOntologyEvalCases(suite.id, getOrgId(req)).catch(err =>
          console.warn("[POST /api/evals] Ontology auto-generation failed:", err.message)
        );
      }
    } catch (e) {
      handleZodError(res, e);
    }
  });


export default router;
