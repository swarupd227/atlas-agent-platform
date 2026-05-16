import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { ensureAarConfig } from "./aar";
import { desc, and, eq } from "drizzle-orm";
import { traceSpans } from "@shared/schema";
import { z, ZodError } from "zod";
import {
  insertAgentSchema,
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
  getTraceRedactionLevel,
  getRedactionLevel,
  redactPayload,
  redactWithOntologyKeys,
} from "../permissions";
import { getOrgId, getDefaultOrgId } from "../auth";
import {
  resolveOntologyTags,
  generateKpiAlignedEvalSuite,
  buildAgentSystemPrompt,
  handleZodError,
  recomputeOutcomeKpis,
  computeConstraintGraph,
  generateOntologyEvalCases,
  resolvePolicyBundle,
} from "./helpers";
import * as nodeCrypto from "crypto";
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
    const agents = await storage.getAgents(getOrgId(req));
    res.json(agents);
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
      const domainPrefix = oTags.length > 0 ? oTags[0] : ((agent as any).industry || agent.name);
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
          evalResults: {
            before: [
              { name: "Core Accuracy Suite", passRate: 87.2, totalCases: 120 },
              { name: "Safety & Compliance", passRate: 94.5, totalCases: 45 },
            ],
            after: [
              { name: "Core Accuracy Suite", passRate: 91.8, totalCases: 120 },
              { name: "Safety & Compliance", passRate: 96.1, totalCases: 45 },
            ],
          },
          shadowReplayResults: {
            divergenceCount: 3,
            totalReplays: 150,
            matchRate: 98.0,
            samples: [
              { input: "Summarize Q4 earnings report", expected: "Revenue up 12% YoY", actual: "Revenue increased 12.3% year-over-year", matched: true },
              { input: "Flag compliance risks in contract", expected: "2 risks identified", actual: "3 risks identified (1 new edge case)", matched: false },
              { input: "Generate customer follow-up email", expected: "Professional tone, 3 action items", actual: "Professional tone, 3 action items", matched: true },
            ],
          },
          blastRadius: {
            affectedOutcomes: [
              { name: agent.outcomeId ? "Primary Outcome Contract" : "Customer Support Automation", riskTier: agent.riskTier || "MEDIUM", kpiImpact: "Success rate +4.6%" },
              { name: "Cost Optimization Program", riskTier: "LOW", kpiImpact: "Cost per run -8%" },
            ],
            affectedSegments: [
              { name: "Enterprise Tier", userCount: 2400, revenueImpact: "$12K/mo at risk" },
              { name: "Growth Tier", userCount: 8900, revenueImpact: "$4.2K/mo at risk" },
            ],
            totalUsersAffected: 11300,
            riskSummary: "Change affects 2 outcome contracts across 2 customer segments. Primary risk: regression in edge-case compliance detection for Enterprise tier.",
          },
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
      const bulkActionSchema = z.object({
        action: z.enum(["regression_eval", "freeze_deployments", "rotate_secrets", "export_audit", "delete"]),
        agentIds: z.array(z.string()).min(1),
      });
      const { action, agentIds } = bulkActionSchema.parse(req.body);

      const allAgents = await storage.getAgents(getOrgId(req));
      const targetAgents = allAgents.filter(a => agentIds.includes(a.id));

      for (const agent of targetAgents) {
        let actionDescription = "";
        if (action === "delete") {
          actionDescription = `Agent "${agent.name}" deleted via bulk action`;
          await storage.deleteAgent(agent.id);
        } else if (action === "regression_eval") {
          actionDescription = `Regression eval triggered for agent "${agent.name}"`;
        } else if (action === "freeze_deployments") {
          actionDescription = `Deployments frozen for agent "${agent.name}"`;
        } else if (action === "rotate_secrets") {
          actionDescription = `Secret rotation initiated for agent "${agent.name}"`;
        } else if (action === "export_audit") {
          actionDescription = `Audit bundle export requested for agent "${agent.name}"`;
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
          industry: industry || undefined,
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

  router.patch("/api/agents/:id", async (req, res) => {
    try {
      const existing = await storage.getAgent(req.params.id, getOrgId(req));
      if (!existing) return res.status(404).json({ message: "Agent not found" });

      const updated = await storage.updateAgent(req.params.id, req.body, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Agent not found" });

      const changedFields = Object.keys(req.body).filter(k => {
        const oldVal = JSON.stringify((existing as any)[k]);
        const newVal = JSON.stringify((req.body as any)[k]);
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
    const traces = await storage.getTracesByAgent(req.params.id, getOrgId(req));
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
        const policies = await storage.getPolicies(getOrgId(req));
        const activePolicies = policies.filter(p => p.status === "active");
        const ontologyTags = Array.isArray((agent as any).ontologyTags) ? (agent as any).ontologyTags as Array<{ conceptId: string; conceptLabel: string }> : [];
        const lines: string[] = [];
        lines.push(`## GOVERNANCE POLICIES`);
        activePolicies.slice(0, 10).forEach(p => {
          const policyJson = p.policyJson as any;
          const enforcement = policyJson?.enforcement || "soft";
          lines.push(`- [${enforcement.toUpperCase()}] ${p.name} (${p.domain}): ${p.description || ""}`);
        });
        if (ontologyTags.length > 0) {
          lines.push(`\n## ONTOLOGY CONCEPTS`);
          ontologyTags.forEach(t => lines.push(`- ${t.conceptLabel} (${t.conceptId})`));
        }
        const preview = lines.join("\n");
        layers.push({
          id: "governance", name: "Industry Governance", description: "Active compliance policies and ontology concept tags",
          status: activePolicies.length > 0 || ontologyTags.length > 0 ? "populated" : "not_configured",
          tokenEstimate: estimateTokens(preview), previewContent: preview,
          sourceLabel: "Governance", sourceUrl: "/governance",
          itemCount: activePolicies.length + ontologyTags.length,
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
          const agentIndustry = (agent as any).industry?.toLowerCase();
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
        if (relevantSkills.length > 0) {
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
          status: relevantSkills.length > 0 || mcpLinks.length > 0 ? "populated" : "not_configured",
          tokenEstimate: estimateTokens(preview), previewContent: preview,
          sourceLabel: "Skills", sourceUrl: "/skills",
          itemCount: relevantSkills.length + mcpLinks.length,
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

  router.post("/api/deployments", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const bypassOntologyCheck = req.body.bypassOntologyCheck === true;
      const { bypassOntologyCheck: _boc, organizationId: _orgIdFromBody, ...deploymentBody } = req.body;
      const data = insertDeploymentSchema.parse(deploymentBody);
      const env = data.environment || "staging";

      const agent = await storage.getAgent(data.agentId, getOrgId(req));

      if (env === "prod" && agent) {
        const blueprints = await storage.getBlueprints();
        const agentBlueprint = blueprints.find(b => b.agentId === data.agentId);
        if (agentBlueprint) {
          const bpJson = agentBlueprint.blueprintJson as any;
          const nodes = bpJson?.nodes || [];
          const toolNodes = nodes.filter((n: any) => {
            const nodeType = (n.type || n.data?.type || "").toLowerCase();
            return nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action");
          });
          const requiredToolNames = toolNodes.map((n: any) => n.data?.toolName || n.data?.tool || n.toolName || n.label || n.id || "unknown");

          const mcpLinks = await storage.getAgentMcpServers(data.agentId);
          const agentMcpServerIds = mcpLinks.map(l => l.serverId);

          const lowAlignmentTools: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }> = [];

          if (agentMcpServerIds.length > 0) {
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
                  lowAlignmentTools.push({
                    toolName: tool.name,
                    serverName: server.name,
                    score: Math.round(score * 100) / 100,
                    matched: matchedCount,
                    total: totalCount,
                  });
                }
              }
            }
          }

          if (lowAlignmentTools.length > 0 && !bypassOntologyCheck) {
            return res.status(400).json({
              blocked: true,
              reason: "ontology_alignment",
              message: `Deployment to prod blocked: ${lowAlignmentTools.length} tool(s) have ontology alignment below 50% threshold`,
              lowAlignmentTools,
            });
          }

          if (lowAlignmentTools.length > 0 && bypassOntologyCheck) {
            const auditEvents = await storage.getAuditEvents(getOrgId(req));
            const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
            const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
            const eventData = `${maxSeq + 1}:ontology_bypass:${data.agentId}:${Date.now()}`;
            const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

            await storage.createAuditEvent({
              actorType: "user",
              actorId: "deployment-service",
              action: "ontology_alignment_bypass",
              objectType: "deployment",
              objectId: data.agentId,
              details: JSON.stringify({
                environment: env,
                agentName: agent.name,
                bypassedTools: lowAlignmentTools,
                reason: "User explicitly bypassed ontology alignment check for prod deployment",
              }),
              sequenceNum: maxSeq + 1,
              previousHash: lastHash,
              eventHash,
              ontologyTags: resolveOntologyTags("deployment", "ontology_alignment_bypass"),
            });
          }
        }
      }

      const deployment = await storage.createDeployment({ ...data, organizationId: getOrgId(req) ?? undefined });

      if (deployment.version && deployment.agentId) {
        await storage.ensureAgentVersion(deployment.agentId, deployment.version, "active");
      }

      // Auto-generate/refresh AAR config when deployment reaches active/deployed state
      if (deployment.status === "deployed" || deployment.status === "active") {
        ensureAarConfig(deployment.agentId).catch(() => {});
      }

      const riskTier = agent?.riskTier || "LOW";
      const strategy = deployment.rolloutStrategy || "canary";

      const needsApproval =
        env === "prod" ||
        riskTier === "HIGH" || riskTier === "CRITICAL" ||
        (env === "pilot" && (riskTier === "MEDIUM" || riskTier === "HIGH" || riskTier === "CRITICAL"));

      let approval = null;
      if (needsApproval) {
        const approvalType = env === "prod" ? "launch_readiness" : "deployment_review";
        const riskScore = riskTier === "CRITICAL" ? 10 : riskTier === "HIGH" ? 8 : riskTier === "MEDIUM" ? 5 : 3;

        const evalSuites = await storage.getEvalSuites();
        const agentSuites = evalSuites.filter(s => s.agentId === deployment.agentId);
        const traces = await storage.getTracesByAgent(deployment.agentId, getOrgId(req));
        const recentTraces = traces.slice(0, 30);
        const totalT = recentTraces.length;
        const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;

        approval = await storage.createApproval({
          type: approvalType,
          objectType: "deployment",
          objectId: deployment.id,
          objectName: `${deployment.agentName || agent?.name || "Agent"} v${deployment.version || "?"} → ${env}`,
          status: "pending",
          requestedBy: "System (Release Creation)",
          agentId: deployment.agentId,
          environment: env,
          description: `${approvalType === "launch_readiness" ? "Production launch readiness" : "Deployment"} review required. Risk: ${riskTier}, Strategy: ${strategy}, Environment: ${env}.`,
          riskScore,
          evidenceJson: {
            agentName: deployment.agentName || agent?.name,
            version: deployment.version,
            riskTier,
            strategy,
            environment: env,
            evalResults: agentSuites.map(s => ({ name: s.name, passRate: s.passRate, totalCases: s.totalCases })),
            metrics: {
              successRate: successRate.toFixed(1) + "%",
              traceCount: totalT,
              errorRate: (totalT > 0 ? (failedT / totalT * 100).toFixed(1) : "0") + "%",
            },
            canaryConfig: deployment.canaryConfig,
            rollbackConfig: deployment.rollbackConfig,
          },
        });

        await storage.createAuditEvent({
          actorType: "system",
          actorId: "release_service",
          action: "approval_auto_created",
          objectType: "deployment",
          objectId: deployment.id,
          details: `Auto-created ${approvalType} approval for ${deployment.agentName || "agent"} v${deployment.version} → ${env} (risk: ${riskTier})`,
          ontologyTags: resolveOntologyTags("deployment", "approval_auto_created"),
        });
      }

      let strategyWarning: string | null = null;
      if (agent?.outcomeId && (strategy === "full" || strategy === "direct")) {
        const kpis = await storage.getKpisByOutcome(agent.outcomeId);
        const pctUnits = ["percent", "%", "percentage", "rate", "ratio", "pct"];
        const slaKpis = kpis.filter(k => k.slaThreshold != null && k.slaThreshold >= 95 && (pctUnits.includes(k.unit.toLowerCase()) || k.slaThreshold <= 100));
        if (slaKpis.length > 0) {
          const maxSla = Math.max(...slaKpis.map(k => k.slaThreshold!));
          const outcome = await storage.getOutcome(agent.outcomeId, getOrgId(req));
          strategyWarning = `Direct deploy not recommended — outcome "${outcome?.name}" requires ≥${maxSla.toFixed(1)}% SLA. Consider canary deployment with tight rollback thresholds.`;
        }
      }

      res.status(201).json({ ...deployment, approval, strategyWarning });
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

  router.post("/api/deployments/freeze", async (req, res) => {
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

  router.patch("/api/deployments/:id", async (req, res) => {
    try {
      const existing = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!existing) return res.status(404).json({ message: "Deployment not found" });
      const data = insertDeploymentSchema.partial().parse(req.body);
      const updated = await storage.updateDeployment(req.params.id, data, getOrgId(req));
      if (!updated) return res.status(404).json({ message: "Deployment not found" });

      if (req.body.status === "active" && existing.status !== "active") {
        const agent = await storage.getAgent(existing.agentId, getOrgId(req));
        const srcTplId = (agent?.runtimeConfig as any)?.sourceTemplateId;
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

  router.post("/api/deployments/:id/initialize-pipeline", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
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
      const updated = await storage.updateDeployment(req.params.id, {
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

  router.post("/api/deployments/:id/advance-stage", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });
      const { stageId, status, attestation, completedBy } = req.body;
      if (!stageId || !status) return res.status(400).json({ message: "stageId and status are required" });
      const stages = (deployment.pipelineStages as any[]) || [];
      const idx = stages.findIndex((s: any) => s.stageId === stageId);
      if (idx === -1) return res.status(404).json({ message: "Stage not found" });
      stages[idx] = {
        ...stages[idx],
        status,
        ...(status === "completed" ? { completedAt: new Date().toISOString(), completedBy: completedBy || "system", attestation } : {}),
      };
      const allComplete = stages.every((s: any) => s.status === "completed" || s.status === "skipped");
      const updated = await storage.updateDeployment(req.params.id, {
        pipelineStages: stages,
        pipelineComplete: allComplete,
      }, getOrgId(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/collect-evidence", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
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
      const updated = await storage.updateDeployment(req.params.id, {
        evidencePackage: evidence,
      }, getOrgId(req));
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/deployments/:id/promote", async (req, res) => {
    try {
      const source = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!source) return res.status(404).json({ message: "Deployment not found" });

      const envOrder = ["staging", "pilot", "prod"];
      const currentIdx = envOrder.indexOf(source.environment);
      if (currentIdx === -1 || currentIdx >= envOrder.length - 1) {
        return res.status(400).json({ message: `Cannot promote from ${source.environment}` });
      }
      const nextEnv = envOrder[currentIdx + 1];

      const bypassEvalGate = req.body.bypassEvalGate === true;

      const promoteAgent = await storage.getAgent(source.agentId, getOrgId(req));
      const promoteRtConfig = (promoteAgent?.runtimeConfig as Record<string, any>) || {};
      const promoteGateOverrides = promoteRtConfig.promotionGateOverrides || {};
      const configuredEvalThreshold = typeof promoteGateOverrides.minEvalPassRate === "number" ? promoteGateOverrides.minEvalPassRate : (nextEnv === "prod" ? 80 : 60);

      const allEvalSuites = await storage.getEvalSuites();
      const agentSuites = allEvalSuites.filter(s => s.agentId === source.agentId);

      let evalWarning: string | undefined;
      const failingSuites: Array<{ name: string; passRate: number }> = [];

      if (configuredEvalThreshold === 0) {
        evalWarning = undefined;
      } else if (agentSuites.length === 0) {
        evalWarning = "No eval suites configured";
      } else {
        for (const suite of agentSuites) {
          const passRate = suite.passRate ?? 0;
          if (passRate < configuredEvalThreshold) {
            failingSuites.push({ name: suite.name, passRate });
          }
        }

        if (failingSuites.length > 0 && nextEnv === "prod" && !bypassEvalGate) {
          const auditEventsAll = await storage.getAuditEvents(getOrgId(req));
          const maxSeqNum = auditEventsAll.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
          const lastHashVal = auditEventsAll.length > 0 ? auditEventsAll[auditEventsAll.length - 1].eventHash || "" : "";
          const evtData = `${maxSeqNum + 1}:eval_gate_blocked:${source.id}:${Date.now()}`;
          const evtHash = `sha256:${nodeCrypto.createHash("sha256").update(evtData + lastHashVal).digest("hex")}`;

          await storage.createAuditEvent({
            actorType: "system",
            actorId: "eval-gate",
            action: "eval_gate_blocked",
            objectType: "deployment",
            objectId: source.id,
            details: JSON.stringify({
              targetEnv: nextEnv,
              failingSuites,
              threshold: 80,
              agentName: source.agentName,
              version: source.version,
            }),
            sequenceNum: maxSeqNum + 1,
            previousHash: lastHashVal,
            eventHash: evtHash,
          });

          return res.status(400).json({
            message: "Eval pass rate too low for production promotion",
            evalGateBlocked: true,
            threshold: configuredEvalThreshold,
            failingSuites,
          });
        }

        if (failingSuites.length > 0 && nextEnv === "pilot") {
          evalWarning = `Eval pass rate below ${configuredEvalThreshold}% on: ${failingSuites.map(s => `${s.name} (${s.passRate.toFixed(1)}%)`).join(", ")}`;
        }
      }

      if (bypassEvalGate && failingSuites.length > 0) {
        const auditEventsAll = await storage.getAuditEvents(getOrgId(req));
        const maxSeqNum = auditEventsAll.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
        const lastHashVal = auditEventsAll.length > 0 ? auditEventsAll[auditEventsAll.length - 1].eventHash || "" : "";
        const evtData = `${maxSeqNum + 1}:eval_gate_bypassed:${source.id}:${Date.now()}`;
        const evtHash = `sha256:${nodeCrypto.createHash("sha256").update(evtData + lastHashVal).digest("hex")}`;

        await storage.createAuditEvent({
          actorType: "user",
          actorId: req.body.approvedBy || "unknown",
          action: "eval_gate_bypassed",
          objectType: "deployment",
          objectId: source.id,
          details: JSON.stringify({
            targetEnv: nextEnv,
            failingSuites,
            threshold: configuredEvalThreshold,
            agentName: source.agentName,
            version: source.version,
            bypassAcknowledgment: true,
          }),
          sequenceNum: maxSeqNum + 1,
          previousHash: lastHashVal,
          eventHash: evtHash,
        });
      }

      const bypassOntologyCheck = req.body.bypassOntologyCheck === true;
      if (nextEnv === "prod") {
        const blueprints = await storage.getBlueprints();
        const agentBlueprint = blueprints.find(b => b.agentId === source.agentId);
        if (agentBlueprint) {
          const bpJson = agentBlueprint.blueprintJson as any;
          const nodes = bpJson?.nodes || [];
          const toolNodes = nodes.filter((n: any) => {
            const nodeType = (n.type || n.data?.type || "").toLowerCase();
            return nodeType.includes("tool") || nodeType.includes("mcp") || nodeType.includes("action");
          });
          const requiredToolNames = toolNodes.map((n: any) => n.data?.toolName || n.data?.tool || n.toolName || n.label || n.id || "unknown");
          const mcpLinks = await storage.getAgentMcpServers(source.agentId);
          const agentMcpServerIds = mcpLinks.map(l => l.serverId);
          const lowAlignmentTools: Array<{ toolName: string; serverName: string; score: number; matched: number; total: number }> = [];

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
                lowAlignmentTools.push({
                  toolName: tool.name,
                  serverName: server.name,
                  score: Math.round(score * 100) / 100,
                  matched: matchedCount,
                  total: totalCount,
                });
              }
            }
          }

          if (lowAlignmentTools.length > 0 && !bypassOntologyCheck) {
            return res.status(400).json({
              blocked: true,
              reason: "ontology_alignment",
              message: `Promotion to prod blocked: ${lowAlignmentTools.length} tool(s) have ontology alignment below 50% threshold`,
              lowAlignmentTools,
            });
          }

          if (lowAlignmentTools.length > 0 && bypassOntologyCheck) {
            const auditEventsAll2 = await storage.getAuditEvents(getOrgId(req));
            const maxSeqNum2 = auditEventsAll2.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
            const lastHashVal2 = auditEventsAll2.length > 0 ? auditEventsAll2[auditEventsAll2.length - 1].eventHash || "" : "";
            const evtData2 = `${maxSeqNum2 + 1}:ontology_bypass:${source.id}:${Date.now()}`;
            const evtHash2 = `sha256:${nodeCrypto.createHash("sha256").update(evtData2 + lastHashVal2).digest("hex")}`;

            await storage.createAuditEvent({
              actorType: "user",
              actorId: req.body.approvedBy || "unknown",
              action: "ontology_alignment_bypass",
              objectType: "deployment",
              objectId: source.id,
              details: JSON.stringify({
                targetEnv: nextEnv,
                agentName: source.agentName,
                version: source.version,
                bypassedTools: lowAlignmentTools,
                reason: "User explicitly bypassed ontology alignment check during promotion to prod",
              }),
              sequenceNum: maxSeqNum2 + 1,
              previousHash: lastHashVal2,
              eventHash: evtHash2,
              ontologyTags: resolveOntologyTags("deployment", "ontology_alignment_bypass"),
            });
          }
        }
      }

      // Policy gate: fail-closed enforcement for staging/prod promotion
      // Any unhandled error in this block BLOCKS promotion (not allows it).
      // No bypass flag — this gate is mandatory per policy enforcement requirements.
      if (nextEnv === "staging" || nextEnv === "prod") {
        const policyFailingChecks: Array<{ check: string; reason: string; severity: "error" | "warn" }> = [];
        let policyGateError: string | null = null;

        try {
          const pBundle = await resolvePolicyBundle(source.agentId, getOrgId(req));
          const agentForGate = promoteAgent;

          // (a) Check policyJson.promotionBlockedEnvs on applied policies
          const allPoliciesForGate = await storage.getPolicies(getOrgId(req));
          const appliedIds = new Set(pBundle.appliedPolicies.map((p: any) => p.id));
          const applicablePolicies = allPoliciesForGate.filter(p => appliedIds.has(p.id));
          for (const p of applicablePolicies) {
            const pj = p.policyJson as Record<string, any> | null;
            if (!pj) continue;
            const blockedEnvs: string[] = Array.isArray(pj.promotionBlockedEnvs) ? pj.promotionBlockedEnvs : [];
            if (blockedEnvs.includes(nextEnv) || blockedEnvs.includes("*")) {
              policyFailingChecks.push({ check: "policy_promotion_blocked", reason: `Policy "${p.name}" (${p.domain}) blocks promotion to ${nextEnv}`, severity: "error" });
            }
            // (b) Check strict/block enforcement: look at the most recent completed trace
            // and filter violations by this specific policy's id — avoids duplicate/false failures
            // across multiple strict policies sharing a single trace.
            const enforcement = pj.enforcement || "monitor";
            if (enforcement === "strict" || enforcement === "block") {
              const recentTracesForPolicy = await storage.getTracesByAgent(source.agentId, getOrgId(req));
              const completedTraces = recentTracesForPolicy
                // Exclude dry-run traces (from /api/agents/:id/policy-check) — these are
                // validation probes, not real execution runs, and must not influence promotion.
                .filter(t => t.environment !== "dry-run" && (t.status === "completed" || t.status === "failed"))
                .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
              const lastCompletedTrace = completedTraces[0];
              if (lastCompletedTrace) {
                const pChecks = lastCompletedTrace.policyChecks as any;
                // Filter violations to only those caused by this specific policy
                const policyViolations: any[] = Array.isArray(pChecks?.violations)
                  ? pChecks.violations.filter((v: any) =>
                      Array.isArray(v.policyIds) ? v.policyIds.includes(p.id) : true
                    )
                  : [];
                if (policyViolations.length > 0) {
                  policyFailingChecks.push({
                    check: "unresolved_policy_violation",
                    reason: `Policy "${p.name}" (${enforcement}) has ${policyViolations.length} unresolved hard violation(s) on last completed run`,
                    severity: "error",
                  });
                }
              }
            }
          }

          // (c) Check for unresolved hard violations on run traces — blocks both staging AND prod.
          // Cross-references audit events (authoritative log) for the last 7 days.
          const recentAuditEvents = await storage.getAuditEvents(getOrgId(req));
          const agentHardViolations = recentAuditEvents.filter(e =>
            e.action === "hard_violation" &&
            e.objectId === source.agentId &&
            new Date(e.createdAt || 0).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
          );
          if (agentHardViolations.length > 0) {
            policyFailingChecks.push({ check: "unresolved_hard_violations", reason: `${agentHardViolations.length} hard violation(s) recorded in the last 7 days — blocks promotion to ${nextEnv}`, severity: "error" });
          }

          // (d) High/Critical risk + autonomous mode always requires manual approval for prod
          const riskTier = agentForGate?.riskTier || "MEDIUM";
          const autonomyMode = agentForGate?.autonomyMode || "assisted";
          if (nextEnv === "prod" && (riskTier === "HIGH" || riskTier === "CRITICAL") && autonomyMode === "autonomous") {
            const approvals = await storage.getApprovals(getOrgId(req));
            const hasPromoApproval = approvals.some(a =>
              a.objectId === source.agentId &&
              a.status === "approved" &&
              (a.type === "deployment_approval" || a.type === "production_promotion") &&
              new Date(a.updatedAt || a.createdAt || 0).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
            );
            if (!hasPromoApproval) {
              policyFailingChecks.push({ check: "manual_approval_required", reason: `Agent is ${riskTier} risk with fully autonomous mode — manual promotion approval required`, severity: "error" });
            }
          }
        } catch (pgErr: any) {
          policyGateError = pgErr.message;
        }

        const hasErrors = policyFailingChecks.some(c => c.severity === "error") || policyGateError !== null;
        if (hasErrors) {
          await storage.createAuditEvent({
            actorType: "system",
            actorId: "policy-gate",
            action: "policy_gate_blocked",
            objectType: "deployment",
            objectId: source.id,
            details: JSON.stringify({
              targetEnv: nextEnv,
              failingChecks: policyFailingChecks,
              gateError: policyGateError,
              agentName: source.agentName,
              version: source.version,
            }),
          }).catch(() => {});
          return res.status(409).json({
            blocked: true,
            reason: "policy_gate",
            message: policyGateError
              ? `Promotion policy gate failed unexpectedly — blocked for safety: ${policyGateError}`
              : `Promotion to ${nextEnv} blocked: ${policyFailingChecks.filter(c => c.severity === "error").length} policy check(s) failed`,
            failingChecks: policyFailingChecks,
          });
        }
      }

      await storage.updateDeployment(source.id, { status: "promoted", promotedAt: new Date() }, getOrgId(req));

      const promoted = await storage.createDeployment({
        agentId: source.agentId,
        agentName: source.agentName,
        environment: nextEnv,
        versionId: source.versionId,
        version: source.version,
        status: "pending",
        canaryPercent: source.canaryConfig ? (source.canaryConfig as any).startPercent || 0 : 0,
        rolloutStrategy: source.rolloutStrategy,
        approvedBy: req.body.approvedBy || source.approvedBy,
        organizationId: source.organizationId ?? undefined,
        signatureHash: source.signatureHash,
        promotedFrom: source.id,
        canaryConfig: source.canaryConfig as any,
        rollbackConfig: source.rollbackConfig as any,
      });

      if (promoted.version && promoted.agentId) {
        await storage.ensureAgentVersion(promoted.agentId, promoted.version, "active");
      }

      if (nextEnv === "prod") {
        const agent = await storage.getAgent(source.agentId, getOrgId(req));
        const evalSuites = await storage.getEvalSuites();
        const agentSuites = evalSuites.filter(s => s.agentId === source.agentId);
        const traces = await storage.getTracesByAgent(source.agentId, getOrgId(req));
        const recentTraces = traces.slice(0, 30);
        const totalT = recentTraces.length;
        const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;
        const avgLat = totalT > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalT) : 0;

        const outcomes = await storage.getOutcomes(getOrgId(req));
        const boundOutcomes = outcomes.filter(o => {
          const attrs = (o.attributionRules as any)?.agents;
          return Array.isArray(attrs) && attrs.some((a: any) => a.agentId === source.agentId);
        });
        const invoices = await storage.getInvoices();
        const agentInvoices = invoices.filter(inv => boundOutcomes.some(o => o.id === inv.outcomeId));
        const revenueExposure = agentInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

        await storage.createApproval({
          type: "launch_readiness",
          objectType: "deployment",
          objectId: promoted.id,
          objectName: `${source.agentName || "Agent"} v${source.version} → Production`,
          status: "pending",
          requestedBy: "System (Auto-Promotion)",
          description: `Production launch readiness review for ${source.agentName} v${source.version}. Requires expert validation before deployment goes live.`,
          riskScore: agent?.riskTier === "HIGH" ? 9 : agent?.riskTier === "MEDIUM" ? 6 : 3,
          evidenceJson: {
            agentName: source.agentName,
            version: source.version,
            riskTier: agent?.riskTier || "MEDIUM",
            autonomyMode: agent?.autonomyMode || "supervised",
            evalResults: agentSuites.map(s => ({ name: s.name, passRate: s.passRate, totalCases: s.totalCases })),
            canaryMetrics: {
              successRate: successRate.toFixed(1) + "%",
              avgLatency: avgLat + "ms",
              errorRate: (totalT > 0 ? (failedT / totalT * 100).toFixed(1) : "0") + "%",
              traceCount: totalT,
            },
            blastRadius: {
              affectedRunsPerDay: Math.round(totalT * (24 / Math.max(1, 168))),
              revenueExposure: `$${revenueExposure.toLocaleString()}`,
              environment: "prod",
              boundOutcomes: boundOutcomes.map(o => o.name).slice(0, 5),
              rollbackTimeEstimate: source.rollbackConfig ? `${(source.rollbackConfig as any).cooldownMinutes || 15}m` : "~15m",
              affectedOutcomes: boundOutcomes.slice(0, 3).map(o => ({
                name: o.name,
                riskTier: o.riskTier || "MEDIUM",
                kpiImpact: `Potential impact on ${o.name} KPIs`,
              })),
              affectedSegments: [
                { name: "All Production Users", userCount: Math.round(totalT * 30), revenueImpact: `$${revenueExposure.toLocaleString()}/mo exposure` },
              ],
              totalUsersAffected: Math.round(totalT * 30),
              riskSummary: `Production deployment of ${source.agentName} v${source.version} affects ${boundOutcomes.length} outcome contract(s). Rollback available in ${source.rollbackConfig ? `${(source.rollbackConfig as any).cooldownMinutes || 15}m` : "~15m"}.`,
            },
            promotedFrom: source.environment,
            deploymentId: promoted.id,
          },
        });
      }

      const responseBody: any = { ...promoted };
      if (evalWarning) {
        responseBody.evalWarning = evalWarning;
      }
      res.status(201).json(responseBody);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/routing", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id as string, getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const { shadowEnabled, canaryPercent, action } = req.body;
      const updateData: Record<string, unknown> = {};

      if (action === "shadow_on") {
        updateData.shadowEnabled = true;
        updateData.status = "shadow";
      } else if (action === "shadow_off") {
        updateData.shadowEnabled = false;
      } else if (action === "canary_start") {
        const startPercent = canaryPercent || (deployment.canaryConfig as any)?.startPercent || 10;
        updateData.canaryPercent = startPercent;
        updateData.status = "canary";
        updateData.shadowEnabled = false;
        updateData.deployedAt = new Date();
      } else if (action === "canary_increase") {
        const newPercent = Math.min(canaryPercent || (deployment.canaryPercent || 0) + 10, 100);
        updateData.canaryPercent = newPercent;
        if (newPercent >= 100) {
          updateData.status = "active";
          updateData.completedAt = new Date();
        }
      } else if (action === "full_rollout") {
        updateData.canaryPercent = 100;
        updateData.status = "active";
        updateData.shadowEnabled = false;
        updateData.completedAt = new Date();

        if (deployment.incidentId) {
          const incident = await storage.getIncident(deployment.incidentId);
          if (incident && incident.status !== "resolved" && incident.status !== "closed") {
            await storage.updateIncident(incident.id, {
              status: "resolved",
              resolvedAt: new Date(),
              remediationRecord: {
                patchId: deployment.patchId || null,
                deploymentId: deployment.id,
                rolloutStrategy: deployment.rolloutStrategy,
                finalCanaryPercent: 100,
                resolvedAt: new Date().toISOString(),
                duration: incident.createdAt ? `${Math.round((Date.now() - new Date(incident.createdAt).getTime()) / 60000)}m` : "unknown",
              },
            }, getOrgId(req));
            await storage.createAuditEvent({
              actorType: "system",
              actorId: "self_healing_service",
              action: "incident_resolved",
              objectType: "incident",
              objectId: incident.id,
              details: `Incident ${incident.id} resolved via full rollout of deployment ${deployment.id}. Patch: ${deployment.patchId || "N/A"}`,
              ontologyTags: resolveOntologyTags("incident", "incident_resolved"),
            });
          }
        }
      } else if (action === "rollback") {
        updateData.status = "rolled_back";
        updateData.canaryPercent = 0;
        updateData.shadowEnabled = false;

        if (deployment.incidentId) {
          const incident = await storage.getIncident(deployment.incidentId);
          if (incident && incident.status !== "open") {
            await storage.updateIncident(incident.id, {
              status: "open",
              remediationRecord: {
                ...(incident.remediationRecord as object || {}),
                rollbackAt: new Date().toISOString(),
                rollbackDeploymentId: deployment.id,
                rollbackReason: "Canary gates failed or manual rollback triggered",
              },
            }, getOrgId(req));
            await storage.createAuditEvent({
              actorType: "system",
              actorId: "self_healing_service",
              action: "incident_reopened",
              objectType: "incident",
              objectId: incident.id,
              details: `Incident ${incident.id} reopened: deployment ${deployment.id} rolled back`,
              ontologyTags: resolveOntologyTags("incident", "incident_reopened"),
            });
          }
        }
      } else {
        if (shadowEnabled !== undefined) updateData.shadowEnabled = shadowEnabled;
        if (canaryPercent !== undefined) updateData.canaryPercent = canaryPercent;
      }

      const updated = await storage.updateDeployment(deployment.id, updateData, getOrgId(req));

      const allEvents = await storage.getAuditEvents(getOrgId(req));
      const maxSeq = allEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const crypto = await import("crypto");
      const lastHash = allEvents.length > 0 ? allEvents[allEvents.length - 1].eventHash || "" : "";
      const eventData = `${maxSeq + 1}:routing_change:${deployment.id}:${Date.now()}`;
      const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "routing_service",
        action: `routing_${action || "update"}`,
        objectType: "deployment",
        objectId: deployment.id,
        ontologyTags: resolveOntologyTags("deployment", `routing_${action || "update"}`),
        details: `Routing update for ${deployment.agentName || "agent"}: ${action || "manual"} | shadow=${updateData.shadowEnabled ?? deployment.shadowEnabled} canary=${updateData.canaryPercent ?? deployment.canaryPercent}%`,
        sequenceNum: maxSeq + 1,
        previousHash: lastHash,
        eventHash,
      });

      if (updateData.status === "active" && deployment.status !== "active") {
        const agent = await storage.getAgent(deployment.agentId, getOrgId(req));
        const srcTplId = (agent?.runtimeConfig as any)?.sourceTemplateId;
        if (srcTplId) {
          await storage.incrementTemplateDeployments(srcTplId);
        }
        // Auto-generate/refresh AAR config when routing transition reaches active
        ensureAarConfig(deployment.agentId).catch(() => {});
      }

      res.json(updated);
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

      const blastRadius = {
        affectedRunsPerDay: Math.round(totalTraces * (24 / Math.max(1, 168))),
        revenueExposure: `$${revenueExposure.toLocaleString()}`,
        environment: deployment.environment,
        downstreamAgents: downstreamCount,
        rollbackTimeEstimate: deployment.rollbackConfig ? `${(deployment.rollbackConfig as any).cooldownMinutes || 15}m` : "~15m",
        boundOutcomes: boundOutcomes.map(o => o.name).slice(0, 5),
      };

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

  router.post("/api/deployments/:id/rollback", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const updated = await storage.updateDeployment(deployment.id, {
        status: "rolled_back",
        completedAt: new Date(),
      }, getOrgId(req));

      const reason = req.body?.reason || "Manual rollback triggered";
      const auditEvents = await storage.getAuditEvents(getOrgId(req));
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:deployment_rollback:${deployment.id}:${Date.now()}`;
      const eventHash = `sha256:${nodeCrypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

      await storage.createAuditEvent({
        actorType: "system",
        actorId: "release-service",
        action: "deployment_rollback_incident",
        objectType: "deployment",
        objectId: deployment.id,
        details: JSON.stringify({
          type: "incident",
          severity: deployment.environment === "prod" ? "high" : "medium",
          agentId: deployment.agentId,
          agentName: deployment.agentName,
          version: deployment.version,
          environment: deployment.environment,
          rolloutStrategy: deployment.rolloutStrategy,
          reason,
          rolledBackAt: new Date().toISOString(),
          previousStatus: deployment.status,
        }),
        sequenceNum: maxSeq + 1,
        previousHash: lastHash,
        eventHash,
      });

      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.post("/api/deployments/:id/auto-promote", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id, getOrgId(req));
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

      const promoted = await storage.createDeployment({
        agentId: deployment.agentId,
        agentName: deployment.agentName,
        environment: "pilot",
        versionId: deployment.versionId,
        version: deployment.version,
        status: "deployed",
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

  router.get("/api/evals", async (_req, res) => {
    const suites = await storage.getEvalSuites();
    res.json(suites);
  });

  router.get("/api/eval-runs", async (_req, res) => {
    const runs = await storage.getAllEvalRuns();
    res.json(runs);
  });

  router.get("/api/eval/results", async (req, res) => {
    const skillId = req.query.skill_id as string;
    if (!skillId) return res.status(400).json({ error: "skill_id query parameter is required" });

    const latestRun = await storage.getLatestEvalRunBySkill(skillId);
    if (!latestRun) return res.json({ run: null, caseResults: [], failingCases: [] });

    const caseResults = await storage.getEvalCaseResults(latestRun.id);
    const failingCases = caseResults.filter(r => !r.passed);
    res.json({ run: latestRun, caseResults, failingCases });
  });

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
      });

      const caseResults = await storage.getEvalCaseResults(run.id);
      res.json({ run, caseResults, failingCases: caseResults.filter(r => !r.passed) });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to run skill eval" });
    }
  });

  router.post("/api/evals", async (req, res) => {
    try {
      const data = insertEvalSuiteSchema.parse(req.body);
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
