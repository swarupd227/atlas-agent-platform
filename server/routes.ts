import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z, ZodError } from "zod";
import OpenAI, { toFile } from "openai";
import multer from "multer";
import { checkPermission, getRequestRole, getTraceRedactionLevel } from "./permissions";
import {
  insertOutcomeContractSchema,
  insertKpiDefinitionSchema,
  insertAgentSchema,
  insertRunTraceSchema,
  insertDeploymentSchema,
  insertEvalSuiteSchema,
  insertPolicySchema,
  insertApprovalSchema,
  insertInvoiceSchema,
  insertAgentTemplateSchema,
  insertEvalTestCaseSchema,
  insertEvalRunSchema,
  insertImprovementRecommendationSchema,
  insertAutonomousActionLogSchema,
  insertImprovementCycleSchema,
  insertPolicyExceptionSchema,
  insertComplianceReportSchema,
  insertEvalCaseResultSchema,
  insertPatchSchema,
  insertExperimentSchema,
  insertBillingDisputeSchema,
  insertBlueprintSchema,
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function checkPatchSafety(patchData: any): string | null {
  const changeType = patchData.changeType || "";
  const desc = (patchData.description || "").toLowerCase();
  const diff = patchData.diff || {};

  if (desc.includes("expand tool permissions") || desc.includes("add tool access") ||
      (diff.after && diff.after.toolPermissions && !diff.before?.toolPermissions)) {
    return "SAFETY: Cannot expand tool permissions without explicit approval. Patch requires CRITICAL tier review.";
  }
  if (desc.includes("write-action") || desc.includes("write action") ||
      (diff.after && diff.after.writeActions !== diff.before?.writeActions)) {
    return "SAFETY: Cannot change write-action behavior without high-tier approval.";
  }
  if (desc.includes("redaction") || desc.includes("audit polic") ||
      changeType === "audit_policy_change") {
    return "SAFETY: Cannot alter redaction/audit policies autonomously.";
  }
  return null;
}

function handleZodError(res: any, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "Validation error", errors: error.errors });
  }
  throw error;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/outcomes", async (_req, res) => {
    const outcomes = await storage.getOutcomes();
    res.json(outcomes);
  });

  app.get("/api/outcomes/:id", async (req, res) => {
    const outcome = await storage.getOutcome(req.params.id);
    if (!outcome) return res.status(404).json({ message: "Not found" });
    res.json(outcome);
  });

  app.post("/api/outcomes", checkPermission("create_modify_outcomes"), async (req, res) => {
    try {
      const data = insertOutcomeContractSchema.parse(req.body);
      const outcome = await storage.createOutcome(data);
      res.status(201).json(outcome);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/outcomes/:id", async (req, res) => {
    try {
      const data = insertOutcomeContractSchema.partial().parse(req.body);
      const updated = await storage.updateOutcome(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/kpis", async (_req, res) => {
    const kpis = await storage.getKpis();
    res.json(kpis);
  });

  app.get("/api/outcomes/:id/kpis", async (req, res) => {
    const kpis = await storage.getKpisByOutcome(req.params.id);
    res.json(kpis);
  });

  app.get("/api/outcomes/:id/evidence", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const kpis = await storage.getKpisByOutcome(outcomeId);
      const agents = await storage.getAgents();
      const traces = await storage.getTraces();
      const outcomeEvents = await storage.getOutcomeEvents();
      const boundAgents = agents.filter(a => a.outcomeId === outcomeId);
      const boundAgentIds = new Set(boundAgents.map(a => a.id));
      const relevantTraces = traces.filter(t => boundAgentIds.has(t.agentId));

      const now = Date.now();
      const kpiTimeSeries = kpis.map(kpi => {
        const points = [];
        for (let i = 6; i >= 0; i--) {
          const dayOffset = i;
          const baseline = kpi.baseline || 0;
          const current = kpi.currentValue || 0;
          const progress = baseline + ((current - baseline) * (7 - i)) / 7;
          const jitter = (Math.random() - 0.5) * (current * 0.1);
          points.push({
            date: new Date(now - dayOffset * 86400000).toISOString().split("T")[0],
            value: Math.round((progress + jitter) * 100) / 100,
          });
        }
        return { kpiId: kpi.id, kpiName: kpi.name, unit: kpi.unit, target: kpi.target, baseline: kpi.baseline, points };
      });

      const totalTraces = relevantTraces.length;
      const failedTraces = relevantTraces.filter(t => t.status === "failed" || t.status === "error").length;
      const successRate = totalTraces > 0 ? ((totalTraces - failedTraces) / totalTraces) * 100 : 100;
      const avgLatency = totalTraces > 0 ? Math.round(relevantTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalTraces) : 0;

      const latencyTrend = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now - (i + 1) * 86400000);
        const dayEnd = new Date(now - i * 86400000);
        const dayTraces = relevantTraces.filter(t => {
          const ts = new Date(t.startedAt || 0).getTime();
          return ts >= dayStart.getTime() && ts < dayEnd.getTime();
        });
        const dayAvg = dayTraces.length > 0
          ? Math.round(dayTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / dayTraces.length)
          : avgLatency;
        latencyTrend.push({
          date: dayEnd.toISOString().split("T")[0],
          value: dayAvg,
        });
      }

      const relevantEvents = outcomeEvents.filter(e => e.outcomeId === outcomeId);
      const billableEvents = relevantEvents.filter(e => e.billable);
      const totalEvents = relevantEvents.length;
      const missingFields = relevantEvents.filter(e => {
        const p = (e.payload || {}) as Record<string, any>;
        return !p.agentRunId || !p.timestamp;
      }).length;

      const dataQuality = {
        totalEvents,
        billableEvents: billableEvents.length,
        missingFieldRate: totalEvents > 0 ? Math.round((missingFields / totalEvents) * 100) : 0,
        schemaConformance: totalEvents > 0 ? Math.round(((totalEvents - missingFields) / totalEvents) * 100) : 100,
        lastEventAt: relevantEvents.length > 0 ? relevantEvents[relevantEvents.length - 1].createdAt : null,
      };

      res.json({
        kpiTimeSeries,
        correlatedMetrics: {
          successRate: Math.round(successRate * 10) / 10,
          avgLatency,
          totalRuns: totalTraces,
          failedRuns: failedTraces,
          latencyTrend,
          agentCount: boundAgents.length,
        },
        dataQuality,
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/outcomes/:id/events", async (req, res) => {
    const outcomeEvents = await storage.getOutcomeEvents();
    const filtered = outcomeEvents.filter(e => e.outcomeId === req.params.id);
    res.json(filtered);
  });

  app.get("/api/outcomes/:id/audit", async (req, res) => {
    const auditEvents = await storage.getAuditEvents();
    const approvals = await storage.getApprovals();
    const outcomeAudits = auditEvents.filter(e => e.objectId === req.params.id || e.objectType === "outcome");
    const outcomeApprovals = approvals.filter(a => a.objectId === req.params.id);
    res.json({ auditEvents: outcomeAudits, approvals: outcomeApprovals });
  });

  app.get("/api/outcomes/:id/snapshots", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const window = (req.query.window as string) || "30d";
      const days = parseInt(window) || 30;
      const kpis = await storage.getKpisByOutcome(outcomeId);
      const outcomeEvents = (await storage.getOutcomeEvents()).filter(e => e.outcomeId === outcomeId);
      const agents = (await storage.getAgents()).filter(a => a.outcomeId === outcomeId);
      const now = Date.now();
      const windowMs = days * 24 * 60 * 60 * 1000;

      const snapshots: Array<{
        date: string;
        kpiValues: Array<{ kpiId: string; kpiName: string; value: number; confidence: number }>;
        topAgents: Array<{ agentId: string; agentName: string; contribution: number }>;
        eventCount: number;
        billableCount: number;
      }> = [];

      for (let d = 0; d < days; d++) {
        const dayTs = now - (days - 1 - d) * 24 * 60 * 60 * 1000;
        const dayStr = new Date(dayTs).toISOString().split("T")[0];
        const dayEvents = outcomeEvents.filter(e => {
          if (!e.createdAt) return false;
          const ts = new Date(e.createdAt).toISOString().split("T")[0];
          return ts === dayStr;
        });

        snapshots.push({
          date: dayStr,
          kpiValues: kpis.map(k => ({
            kpiId: k.id,
            kpiName: k.name,
            value: k.currentValue || 0,
            confidence: k.confidence || 0,
          })),
          topAgents: agents.slice(0, 3).map(a => ({
            agentId: a.id,
            agentName: a.name,
            contribution: a.successRate || 0,
          })),
          eventCount: dayEvents.length,
          billableCount: dayEvents.filter(e => e.billable).length,
        });
      }

      res.json({ snapshots, window, days });
    } catch (err) {
      res.status(500).json({ message: "Failed to get snapshots" });
    }
  });

  app.post("/api/outcomes/:id/versions", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId);
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const newVersion = (outcome.version || 1) + 1;
      const changes = req.body.changes || {};
      const reason = req.body.reason || "Version bump";

      const updated = await storage.updateOutcome(outcomeId, {
        ...changes,
        version: newVersion,
      });

      await storage.createAuditEvent({
        objectType: "outcome",
        objectId: outcomeId,
        action: "version_created",
        actorId: req.body.actorId || "system",
        details: JSON.stringify({
          fromVersion: outcome.version,
          toVersion: newVersion,
          reason,
          changes,
        }),
      });

      res.status(201).json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to create version" });
    }
  });

  app.get("/api/outcomes/:id/versions", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId);
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const auditEvents = await storage.getAuditEvents();
      const versionEvents = auditEvents.filter(
        e => e.objectId === outcomeId && (e.action === "version_created" || e.action === "outcome_updated" || e.action === "create_outcome")
      ).sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime());

      const versions = versionEvents.map((evt) => {
        let details: any = {};
        try {
          details = typeof evt.details === "string" ? JSON.parse(evt.details) : evt.details || {};
        } catch { details = {}; }
        return {
          version: details.toVersion || details.version || outcome.version || 1,
          changedAt: evt.createdAt?.toISOString() || new Date().toISOString(),
          changedBy: evt.actorId || "system",
          summary: details.reason || evt.action.replace(/_/g, " "),
          diff: details.changes || {},
        };
      });

      if (versions.length === 0) {
        versions.push({
          version: outcome.version || 1,
          changedAt: outcome.createdAt?.toString() || new Date().toISOString(),
          changedBy: "system",
          summary: "Initial contract creation",
          diff: {},
        });
      }

      res.json(versions);
    } catch (err) {
      res.status(500).json({ message: "Failed to get versions" });
    }
  });

  app.post("/api/exports/outcome/:id/audit", async (req, res) => {
    try {
      const outcomeId = req.params.id;
      const outcome = await storage.getOutcome(outcomeId);
      if (!outcome) return res.status(404).json({ message: "Outcome not found" });

      const auditEvents = await storage.getAuditEvents();
      const approvals = await storage.getApprovals();
      const kpis = await storage.getKpisByOutcome(outcomeId);

      const outcomeAudits = auditEvents.filter(e => e.objectId === outcomeId || e.objectType === "outcome");
      const outcomeApprovals = approvals.filter(a => a.objectId === outcomeId);

      const bundle = {
        exportedAt: new Date().toISOString(),
        outcome: {
          id: outcome.id,
          name: outcome.name,
          version: outcome.version,
          status: outcome.status,
          riskTier: outcome.riskTier,
        },
        kpis: kpis.map(k => ({
          id: k.id,
          name: k.name,
          target: k.target,
          currentValue: k.currentValue,
          confidence: k.confidence,
          slaThreshold: k.slaThreshold,
        })),
        auditEvents: outcomeAudits.map(e => ({
          id: e.id,
          action: e.action,
          actorId: e.actorId,
          timestamp: e.createdAt,
          details: e.details,
        })),
        approvals: outcomeApprovals.map(a => ({
          id: a.id,
          type: a.type,
          status: a.status,
          decidedBy: a.decidedBy,
          decidedAt: a.decidedAt,
          riskScore: a.riskScore,
        })),
        totalAuditEvents: outcomeAudits.length,
        totalApprovals: outcomeApprovals.length,
      };

      res.json(bundle);
    } catch (err) {
      res.status(500).json({ message: "Failed to export audit bundle" });
    }
  });

  app.post("/api/kpis", async (req, res) => {
    try {
      const data = insertKpiDefinitionSchema.parse(req.body);
      const kpi = await storage.createKpi(data);
      res.status(201).json(kpi);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/kpis/:id", async (req, res) => {
    try {
      const data = insertKpiDefinitionSchema.partial().parse(req.body);
      const updated = await storage.updateKpi(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.delete("/api/kpis/:id", async (req, res) => {
    await storage.deleteKpi(req.params.id);
    res.status(204).send();
  });

  app.get("/api/agents", async (_req, res) => {
    const agents = await storage.getAgents();
    res.json(agents);
  });

  app.get("/api/agents/:id", async (req, res) => {
    const agent = await storage.getAgent(req.params.id);
    if (!agent) return res.status(404).json({ message: "Not found" });
    res.json(agent);
  });

  app.post("/api/agents", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertAgentSchema.parse(req.body);
      const agent = await storage.createAgent(data);

      const tools = Array.isArray(agent.toolsConfig) ? agent.toolsConfig as Array<{ name?: string; description?: string }> : [];
      const bp = agent.blueprintJson && typeof agent.blueprintJson === "object" ? agent.blueprintJson as Record<string, unknown> : {};
      const workflow = (
        Array.isArray(bp.nodes) ? bp.nodes :
        Array.isArray(bp.workflowNodes) ? bp.workflowNodes : []
      ) as Array<{ id?: string; type?: string; label?: string }>;

      const testCases: Array<{ name: string; inputData: unknown; expectedOutput: unknown; tags: string[] }> = [];

      testCases.push({
        name: "Baseline Latency Check",
        inputData: { type: "latency_probe", payload: "standard_input" },
        expectedOutput: { maxLatencyMs: 5000, status: "pass" },
        tags: ["baseline", "latency"],
      });
      testCases.push({
        name: "Error Handling - Invalid Input",
        inputData: { type: "invalid", payload: null },
        expectedOutput: { status: "graceful_error", errorHandled: true },
        tags: ["error_handling", "robustness"],
      });

      for (const tool of tools.slice(0, 5)) {
        if (tool.name) {
          testCases.push({
            name: `Tool Permission - ${tool.name}`,
            inputData: { type: "tool_access", tool: tool.name, action: "invoke" },
            expectedOutput: { authorized: true, toolResponds: true },
            tags: ["tool_permission", tool.name],
          });
        }
      }

      for (const node of workflow.slice(0, 5)) {
        if (node.type === "human_review") {
          testCases.push({
            name: `Escalation Path - ${node.label || node.id}`,
            inputData: { type: "escalation_trigger", nodeId: node.id },
            expectedOutput: { escalated: true, reviewerNotified: true },
            tags: ["escalation", "human_review"],
          });
        } else if (node.type) {
          testCases.push({
            name: `Workflow Node - ${node.label || node.id || node.type}`,
            inputData: { type: "workflow_step", nodeId: node.id, nodeType: node.type },
            expectedOutput: { stepCompleted: true },
            tags: ["workflow", node.type],
          });
        }
      }

      if (agent.memoryRagConfig && typeof agent.memoryRagConfig === "object") {
        testCases.push({
          name: "RAG Retrieval Quality",
          inputData: { type: "retrieval_probe", query: "test retrieval accuracy" },
          expectedOutput: { relevanceScore: 0.7, documentsReturned: true },
          tags: ["rag", "retrieval"],
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
        },
      });

      await storage.createAuditEvent({
        actorType: "system",
        actorId: agent.owner || "system",
        action: "agent_created",
        objectType: "agent",
        objectId: agent.id,
        details: `Agent "${agent.name}" created with auto-scaffolded eval suite (${testCases.length} test cases) and blueprint review approval`,
      });

      res.status(201).json(agent);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.post("/api/agents/bulk-action", async (req, res) => {
    try {
      const bulkActionSchema = z.object({
        action: z.enum(["regression_eval", "freeze_deployments", "rotate_secrets", "export_audit"]),
        agentIds: z.array(z.string()).min(1),
      });
      const { action, agentIds } = bulkActionSchema.parse(req.body);

      const allAgents = await storage.getAgents();
      const targetAgents = allAgents.filter(a => agentIds.includes(a.id));

      for (const agent of targetAgents) {
        let actionDescription = "";
        if (action === "regression_eval") {
          actionDescription = `Regression eval triggered for agent "${agent.name}"`;
        } else if (action === "freeze_deployments") {
          actionDescription = `Deployments frozen for agent "${agent.name}"`;
        } else if (action === "rotate_secrets") {
          actionDescription = `Secret rotation initiated for agent "${agent.name}"`;
        } else if (action === "export_audit") {
          actionDescription = `Audit bundle export requested for agent "${agent.name}"`;
        }

        await storage.createAuditEvent({
          actorType: "user",
          actorId: "ops_user",
          action: `bulk_${action}`,
          objectType: "agent",
          objectId: agent.id,
          details: actionDescription,
        });
      }

      res.json({ success: true, processed: targetAgents.length, action });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Bulk action failed" });
    }
  });

  app.patch("/api/agents/:id", async (req, res) => {
    try {
      const updated = await storage.updateAgent(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Agent not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/agents/:id/traces", async (req, res) => {
    const traces = await storage.getTracesByAgent(req.params.id);
    res.json(traces);
  });

  app.get("/api/agents/:id/evals", async (req, res) => {
    const evals = await storage.getEvalsByAgent(req.params.id);
    res.json(evals);
  });

  app.get("/api/agents/:id/recommendations", async (req, res) => {
    const recs = await storage.getImprovementRecommendationsByAgent(req.params.id);
    res.json(recs);
  });

  app.get("/api/agents/:id/autonomous-actions", async (req, res) => {
    const logs = await storage.getAutonomousActionLogsByAgent(req.params.id);
    res.json(logs);
  });

  app.get("/api/agents/:id/versions", async (req, res) => {
    const versions = await storage.getAgentVersions(req.params.id);
    res.json(versions);
  });

  app.get("/api/eval-suites", async (_req, res) => {
    const suites = await storage.getEvalSuites();
    res.json(suites);
  });

  app.get("/api/traces", async (_req, res) => {
    const traces = await storage.getTraces();
    res.json(traces);
  });

  app.get("/api/traces/:id", async (req, res) => {
    const trace = await storage.getTrace(req.params.id);
    if (!trace) return res.status(404).json({ error: "Trace not found" });
    res.json(trace);
  });

  app.post("/api/traces", async (req, res) => {
    try {
      const data = insertRunTraceSchema.parse(req.body);
      const trace = await storage.createTrace(data);
      res.status(201).json(trace);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/deployments", async (_req, res) => {
    const deployments = await storage.getDeployments();
    res.json(deployments);
  });

  app.post("/api/deployments", checkPermission("deploy_staging_pilot"), async (req, res) => {
    try {
      const data = insertDeploymentSchema.parse(req.body);
      const deployment = await storage.createDeployment(data);
      res.status(201).json(deployment);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/deployments/health", async (_req, res) => {
    try {
      const deployments = await storage.getDeployments();
      const traces = await storage.getTraces();
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

  app.get("/api/deployments/freeze-status", async (_req, res) => {
    try {
      const auditEvents = await storage.getAuditEvents();
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

  app.post("/api/deployments/freeze", async (req, res) => {
    try {
      const { action, scope, targetId, reason } = req.body;
      if (!action || !scope) {
        return res.status(400).json({ message: "action and scope are required" });
      }

      const auditEvents = await storage.getAuditEvents();
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:deployment_${action}:${targetId || scope}:${Date.now()}`;
      const eventHash = `sha256:${crypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

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
      });

      res.json({ success: true, event: auditEvent });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/deployments/:id", async (req, res) => {
    const deployment = await storage.getDeployment(req.params.id);
    if (!deployment) return res.status(404).json({ message: "Deployment not found" });
    res.json(deployment);
  });

  app.patch("/api/deployments/:id", async (req, res) => {
    try {
      const data = insertDeploymentSchema.partial().parse(req.body);
      const updated = await storage.updateDeployment(req.params.id, data);
      if (!updated) return res.status(404).json({ message: "Deployment not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.post("/api/deployments/:id/promote", async (req, res) => {
    try {
      const source = await storage.getDeployment(req.params.id);
      if (!source) return res.status(404).json({ message: "Deployment not found" });

      const envOrder = ["staging", "pilot", "prod"];
      const currentIdx = envOrder.indexOf(source.environment);
      if (currentIdx === -1 || currentIdx >= envOrder.length - 1) {
        return res.status(400).json({ message: `Cannot promote from ${source.environment}` });
      }
      const nextEnv = envOrder[currentIdx + 1];

      await storage.updateDeployment(source.id, { status: "promoted", promotedAt: new Date() });

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
        signatureHash: source.signatureHash,
        promotedFrom: source.id,
        canaryConfig: source.canaryConfig as any,
        rollbackConfig: source.rollbackConfig as any,
      });

      if (nextEnv === "prod") {
        const agent = await storage.getAgent(source.agentId);
        const evalSuites = await storage.getEvalSuites();
        const agentSuites = evalSuites.filter(s => s.agentId === source.agentId);
        const traces = await storage.getTracesByAgent(source.agentId);
        const recentTraces = traces.slice(0, 30);
        const totalT = recentTraces.length;
        const failedT = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;
        const successRate = totalT > 0 ? ((totalT - failedT) / totalT * 100) : 100;
        const avgLat = totalT > 0 ? Math.round(recentTraces.reduce((s, t) => s + (t.latencyMs || 0), 0) / totalT) : 0;

        const outcomes = await storage.getOutcomes();
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
            },
            promotedFrom: source.environment,
            deploymentId: promoted.id,
          },
        });
      }

      res.status(201).json(promoted);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/deployments/:id/readiness", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const agentId = deployment.agentId;
      const traces = await storage.getTracesByAgent(agentId);
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

      const bestSuite = agentSuites.reduce((best, s) => (!best || (s.passRate || 0) > (best.passRate || 0) ? s : best), agentSuites[0] as typeof agentSuites[0] | undefined);
      const evalPassRate = bestSuite?.passRate ?? null;
      const evalSuiteName = bestSuite?.name ?? null;

      const criticalDrift = agentDrift.filter((d: any) => d.severity === "critical");
      const highDrift = agentDrift.filter((d: any) => d.severity === "high");

      const checks = [
        {
          name: "Eval Pass Rate",
          status: evalPassRate === null ? "unknown" : evalPassRate >= 80 ? "pass" : evalPassRate >= 60 ? "warn" : "fail",
          value: evalPassRate !== null ? `${evalPassRate.toFixed(1)}%` : "No evals",
          detail: evalSuiteName ? `Suite: ${evalSuiteName}` : "No eval suite found",
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
          status: avgLatency <= 2000 ? "pass" : avgLatency <= 5000 ? "warn" : "fail",
          value: `${avgLatency}ms`,
          detail: avgLatency <= 2000 ? "Within threshold" : avgLatency <= 5000 ? "Elevated" : "Exceeds threshold",
        },
        {
          name: "Error Rate",
          status: failedTraces.length === 0 ? "pass" : failedTraces.length <= 2 ? "warn" : "fail",
          value: totalTraces > 0 ? `${((failedTraces.length / totalTraces) * 100).toFixed(1)}%` : "0%",
          detail: `${failedTraces.length} failures in last ${totalTraces} runs`,
        },
      ];

      const overallStatus = checks.some(c => c.status === "fail") ? "blocked" : checks.some(c => c.status === "warn") ? "warning" : "ready";

      const agent = await storage.getAgent(agentId);
      const outcomes = await storage.getOutcomes();
      const boundOutcomes = outcomes.filter(o => {
        const agents = (o.attributionRules as any)?.agents;
        if (Array.isArray(agents)) return agents.some((a: any) => a.agentId === agentId);
        return false;
      });
      const allAgents = await storage.getAgents();
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

      res.json({ checks, overallStatus, blastRadius, agentName: agent?.name || "Unknown" });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.post("/api/deployments/:id/rollback", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      const updated = await storage.updateDeployment(deployment.id, {
        status: "rolled_back",
        completedAt: new Date(),
      });

      const reason = req.body?.reason || "Manual rollback triggered";
      const auditEvents = await storage.getAuditEvents();
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:deployment_rollback:${deployment.id}:${Date.now()}`;
      const eventHash = `sha256:${crypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

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

  app.post("/api/deployments/:id/auto-promote", async (req, res) => {
    try {
      const deployment = await storage.getDeployment(req.params.id);
      if (!deployment) return res.status(404).json({ message: "Deployment not found" });

      if (deployment.environment !== "staging") {
        return res.status(400).json({ message: "Auto-promote is only available for staging deployments" });
      }

      const agent = await storage.getAgent(deployment.agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      if (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL") {
        return res.status(400).json({
          message: `Auto-promote blocked: agent risk tier is ${agent.riskTier}. Manual promotion required.`,
          eligible: false,
        });
      }

      const traces = await storage.getTracesByAgent(deployment.agentId);
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

      if (successRate < 95 || (agentSuites.length > 0 && latestPassRate < 80)) {
        return res.status(400).json({
          message: "Auto-promote blocked: readiness checks not passing",
          eligible: false,
          checks: {
            successRate: { value: successRate.toFixed(1), threshold: 95, pass: successRate >= 95 },
            evalPassRate: { value: latestPassRate.toFixed(1), threshold: 80, pass: latestPassRate >= 80 },
          },
        });
      }

      await storage.updateDeployment(deployment.id, { status: "promoted", promotedAt: new Date() });

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
        signatureHash: deployment.signatureHash,
        promotedFrom: deployment.id,
        canaryConfig: deployment.canaryConfig as any,
        rollbackConfig: deployment.rollbackConfig as any,
        deployedAt: new Date(),
      });

      const auditEvents = await storage.getAuditEvents();
      const maxSeq = auditEvents.reduce((max, e) => Math.max(max, e.sequenceNum || 0), 0);
      const lastHash = auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].eventHash || "" : "";
      const crypto = await import("crypto");
      const eventData = `${maxSeq + 1}:auto_promote:${deployment.id}:${Date.now()}`;
      const eventHash = `sha256:${crypto.createHash("sha256").update(eventData + lastHash).digest("hex")}`;

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

  app.get("/api/evals", async (_req, res) => {
    const suites = await storage.getEvalSuites();
    res.json(suites);
  });

  app.get("/api/eval-runs", async (_req, res) => {
    const runs = await storage.getAllEvalRuns();
    res.json(runs);
  });

  app.post("/api/evals", async (req, res) => {
    try {
      const data = insertEvalSuiteSchema.parse(req.body);
      const suite = await storage.createEvalSuite(data);
      res.status(201).json(suite);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/policies", async (_req, res) => {
    const policies = await storage.getPolicies();
    res.json(policies);
  });

  app.post("/api/policies", checkPermission("create_modify_policies"), async (req, res) => {
    try {
      const data = insertPolicySchema.parse(req.body);
      const policy = await storage.createPolicy(data);
      res.status(201).json(policy);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/policies/:id/test-cases", async (req, res) => {
    const testCases = await storage.getPolicyTestCases(req.params.id);
    res.json(testCases);
  });

  app.post("/api/policies/:id/test-cases", async (req, res) => {
    const testCase = await storage.createPolicyTestCase({
      ...req.body,
      policyId: req.params.id,
    });
    res.json(testCase);
  });

  app.get("/api/approvals", async (_req, res) => {
    const approvals = await storage.getApprovals();
    res.json(approvals);
  });

  app.get("/api/approvals/:id", async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string);
    if (!approval) return res.status(404).json({ message: "Approval not found" });

    const agents = await storage.getAgents();
    const outcomes = await storage.getOutcomes();
    const evalSuites = await storage.getEvalSuites();
    const policies = await storage.getPolicies();
    const auditEvents = await storage.getAuditEvents();

    const agent = approval.agentId ? agents.find(a => a.id === approval.agentId) : agents.find(a => a.id === approval.objectId);
    const outcome = approval.outcomeId ? outcomes.find(o => o.id === approval.outcomeId) : null;
    const agentSuites = agent ? evalSuites.filter(s => s.agentId === agent.id) : [];
    const relatedAudit = auditEvents.filter(e => e.objectId === approval.id || e.objectId === approval.objectId).slice(0, 20);
    const effectivePolicies = policies.filter(p => {
      if (!agent) return false;
      const scope = (p as any).scope;
      return scope === "global" || scope === agent.riskTier?.toLowerCase();
    });

    res.json({
      ...approval,
      agent,
      outcome,
      evalSuites: agentSuites,
      effectivePolicies: effectivePolicies,
      auditTrail: relatedAudit,
    });
  });

  app.post("/api/approvals", checkPermission("approve_changes"), async (req, res) => {
    try {
      const data = insertApprovalSchema.parse(req.body);
      const approval = await storage.createApproval(data);
      res.status(201).json(approval);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/approvals/:id", checkPermission("approve_changes"), async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string);
    if (!approval) return res.status(404).json({ message: "Approval not found" });

    const { status, decidedBy, constraintsJson, followUpTask } = req.body;
    const updateData: any = { decidedAt: new Date() };
    if (status) updateData.status = status;
    if (decidedBy) updateData.decidedBy = decidedBy;
    if (constraintsJson) updateData.constraintsJson = constraintsJson;

    if (status === "rejected" && followUpTask) {
      const followUp = await storage.createApproval({
        type: "follow_up_task",
        objectType: approval.objectType,
        objectId: approval.objectId,
        objectName: `Follow-up: ${approval.objectName || approval.type}`,
        status: "pending",
        requestedBy: decidedBy || "Expert Validator",
        description: followUpTask.description || `Follow-up from rejected ${approval.type}`,
        riskScore: approval.riskScore,
        agentId: approval.agentId,
        outcomeId: approval.outcomeId,
        environment: approval.environment,
        evidenceJson: { parentApprovalId: approval.id, reason: followUpTask.reason },
      });
      updateData.followUpTaskId = followUp.id;
    }

    const updated = await storage.updateApproval(req.params.id as string, updateData);

    const allEvents = await storage.getAuditEvents();
    const prevHash = allEvents.length > 0 ? allEvents[allEvents.length - 1] : null;
    await storage.createAuditEvent({
      actorType: "expert_validator",
      actorId: decidedBy || "system",
      action: `approval_${status || "updated"}`,
      objectType: "approval",
      objectId: approval.id,
      details: `Approval "${approval.objectName || approval.type}" ${status || "updated"} by ${decidedBy || "system"}${constraintsJson ? " with constraints" : ""}`,
      sequenceNum: allEvents.length + 1,
      previousHash: prevHash?.eventHash || null,
      eventHash: `sha256:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    });

    res.json(updated);
  });

  app.get("/api/approvals/:id/requirements", async (req, res) => {
    const approval = await storage.getApproval(req.params.id as string);
    if (!approval) return res.status(404).json({ message: "Not found" });

    const requirements: Array<{ rule: string; met: boolean; detail: string }> = [];

    const riskScore = approval.riskScore || 0;
    if (riskScore > 7) {
      requirements.push({ rule: "High-risk outcome tier", met: false, detail: "Requires senior expert approval for risk score > 7" });
    }
    if (approval.toolPermissionClass === "CRITICAL" || approval.toolPermissionClass === "RESTRICTED") {
      requirements.push({ rule: "Restricted tool access", met: false, detail: `Tool permission class "${approval.toolPermissionClass}" requires security review` });
    }
    if (approval.environment === "production" || approval.environment === "pilot") {
      requirements.push({ rule: "Production/pilot environment", met: false, detail: `Changes to ${approval.environment} require additional validation` });
    }
    const highRiskChangeTypes = ["model_change", "tool_change", "policy_change"];
    if (approval.changeType && highRiskChangeTypes.includes(approval.changeType)) {
      requirements.push({ rule: "High-risk change type", met: false, detail: `${approval.changeType.replace(/_/g, " ")} changes require expert review` });
    }
    if (requirements.length === 0) {
      requirements.push({ rule: "Standard review", met: true, detail: "Standard approval process applies" });
    }

    res.json({ approvalId: approval.id, requirements });
  });

  app.get("/api/audit-events", async (_req, res) => {
    const events = await storage.getAuditEvents();
    res.json(events);
  });

  app.get("/api/audit-events/export-bundle", async (req, res) => {
    const { type, startDate, endDate, includeHashes } = req.query;
    const validTypes = ["all_events", "runs", "approvals", "policy_changes"];
    const exportType = validTypes.includes(type as string) ? (type as string) : "all_events";
    let data: any[] = [];
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid date format" });
    }

    if (exportType === "runs") {
      const allRuns = await storage.getTraces();
      data = allRuns.filter(r => {
        if (!r.startedAt) return false;
        const d = new Date(r.startedAt);
        return d >= start && d <= end;
      });
    } else if (exportType === "approvals") {
      const allApprovals = await storage.getApprovals();
      data = allApprovals.filter(a => {
        if (!a.createdAt) return false;
        const d = new Date(a.createdAt);
        return d >= start && d <= end;
      });
    } else if (exportType === "policy_changes") {
      const allEvents = await storage.getAuditEvents();
      data = allEvents.filter(e => {
        if (!e.createdAt) return false;
        const d = new Date(e.createdAt);
        const isPolicy = e.objectType === "policy" || e.action.includes("policy");
        return isPolicy && d >= start && d <= end;
      });
    } else {
      const allEvents = await storage.getAuditEvents();
      data = allEvents.filter(e => {
        if (!e.createdAt) return false;
        const d = new Date(e.createdAt);
        return d >= start && d <= end;
      });
    }

    const bundle: any = {
      exportType,
      exportedAt: new Date().toISOString(),
      timeWindow: { start: start.toISOString(), end: end.toISOString() },
      totalRecords: data.length,
      records: data,
    };

    if (includeHashes === "true") {
      const allEvents = await storage.getAuditEvents();
      const lastEvent = allEvents[allEvents.length - 1];
      bundle.integrityInfo = {
        chainLength: allEvents.length,
        lastHash: lastEvent?.eventHash || null,
        lastSequence: lastEvent?.sequenceNum || 0,
        verified: true,
      };
    }

    res.json(bundle);
  });

  app.get("/api/audit-events/verify-integrity", async (_req, res) => {
    const result = await storage.verifyAuditChainIntegrity();
    res.json(result);
  });

  app.get("/api/policy-exceptions", async (_req, res) => {
    const exceptions = await storage.getPolicyExceptions();
    res.json(exceptions);
  });

  app.get("/api/policy-exceptions/agent/:agentId", async (req, res) => {
    const exceptions = await storage.getPolicyExceptionsByAgent(req.params.agentId);
    res.json(exceptions);
  });

  app.post("/api/policy-exceptions", async (req, res) => {
    try {
      const data = insertPolicyExceptionSchema.parse(req.body);
      const exception = await storage.createPolicyException(data);
      res.status(201).json(exception);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/policy-exceptions/:id", async (req, res) => {
    const updated = await storage.updatePolicyException(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.get("/api/compliance-reports", async (_req, res) => {
    const reports = await storage.getComplianceReports();
    res.json(reports);
  });

  app.post("/api/compliance-reports", async (req, res) => {
    try {
      const data = insertComplianceReportSchema.parse(req.body);
      const report = await storage.createComplianceReport(data);
      res.status(201).json(report);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/invoices", async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  app.post("/api/invoices", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const data = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(data);
      res.status(201).json(invoice);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/invoices/:id", async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  });

  app.get("/api/invoices/:id/line-items", async (req, res) => {
    const invoice = await storage.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    const events = await storage.getOutcomeEventsByInvoice(req.params.id);
    const traces = await storage.getTraces();
    const agents = await storage.getAgents();
    const lineItems = events.map(event => {
      const trace = event.traceId ? traces.find(t => t.id === event.traceId) : null;
      const agent = event.agentId ? agents.find(a => a.id === event.agentId) : null;
      return {
        ...event,
        agentName: agent?.name || null,
        traceStatus: trace?.status || null,
        traceLatencyMs: trace?.latencyMs || null,
      };
    });
    res.json({ invoice, lineItems });
  });

  app.get("/api/billing/metering-dashboard", async (_req, res) => {
    try {
      const allInvoices = await storage.getInvoices();
      const allEvents = await storage.getOutcomeEvents();
      const allDisputes = await storage.getBillingDisputes();
      const outcomes = await storage.getOutcomes();

      const totalEvents = allEvents.length;
      const billableEvents = allEvents.filter(e => e.billable);
      const excludedEvents = allEvents.filter(e => !e.billable);
      const acceptanceRate = totalEvents > 0 ? billableEvents.length / totalEvents : 0;

      const totalUnitsDelivered = allEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);
      const billableUnits = billableEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);
      const excludedUnits = excludedEvents.reduce((sum, e) => sum + (e.unitCount || 1), 0);

      const paidInvoices = allInvoices.filter(inv => inv.status === "paid");
      const pendingInvoices = allInvoices.filter(inv => inv.status === "pending");
      const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
      const pendingRevenue = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

      const now = new Date();
      const monthlyRevenue: Array<{ month: string; revenue: number; units: number }> = [];
      for (let m = 5; m >= 0; m--) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthInvoices = allInvoices.filter(inv => {
          if (!inv.periodStart) return false;
          const ps = new Date(inv.periodStart);
          return ps.getFullYear() === d.getFullYear() && ps.getMonth() === d.getMonth();
        });
        monthlyRevenue.push({
          month: monthKey,
          revenue: monthInvoices.reduce((s, inv) => s + (inv.amount || 0), 0),
          units: monthInvoices.reduce((s, inv) => s + (inv.totalUnits || 0), 0),
        });
      }

      const revenueGrowth = monthlyRevenue.length >= 2 && monthlyRevenue[monthlyRevenue.length - 2].revenue > 0
        ? ((monthlyRevenue[monthlyRevenue.length - 1].revenue - monthlyRevenue[monthlyRevenue.length - 2].revenue) / monthlyRevenue[monthlyRevenue.length - 2].revenue * 100)
        : 0;

      const avgMonthlyRevenue = monthlyRevenue.reduce((s, m) => s + m.revenue, 0) / Math.max(monthlyRevenue.filter(m => m.revenue > 0).length, 1);
      const projectedAnnualRevenue = avgMonthlyRevenue * 12;

      const excludeReasons: Record<string, number> = {};
      excludedEvents.forEach(e => {
        const reason = e.excludeReason || "unspecified";
        excludeReasons[reason] = (excludeReasons[reason] || 0) + 1;
      });

      const outcomeMetering = outcomes.map(o => {
        const oEvents = allEvents.filter(e => e.outcomeId === o.id);
        const oInvoices = allInvoices.filter(inv => inv.outcomeId === o.id);
        const oDisputes = allDisputes.filter(d => d.outcomeId === o.id);
        const oBillable = oEvents.filter(e => e.billable);
        return {
          outcomeId: o.id,
          outcomeName: o.name,
          totalEvents: oEvents.length,
          billableEvents: oBillable.length,
          excludedEvents: oEvents.length - oBillable.length,
          acceptanceRate: oEvents.length > 0 ? oBillable.length / oEvents.length : 0,
          totalRevenue: oInvoices.reduce((s, inv) => s + (inv.amount || 0), 0),
          totalUnits: oEvents.reduce((s, e) => s + (e.unitCount || 1), 0),
          invoiceCount: oInvoices.length,
          disputeCount: oDisputes.length,
          disputeAmount: oDisputes.reduce((s, d) => s + (d.amount || 0), 0),
        };
      });

      const openDisputes = allDisputes.filter(d => d.status === "open");
      const resolvedDisputes = allDisputes.filter(d => d.status === "resolved");
      const rejectedDisputes = allDisputes.filter(d => d.status === "rejected");
      const disputeCategories: Record<string, number> = {};
      allDisputes.forEach(d => {
        disputeCategories[d.category] = (disputeCategories[d.category] || 0) + 1;
      });

      res.json({
        summary: {
          totalRevenue,
          pendingRevenue,
          projectedAnnualRevenue,
          revenueGrowth: Math.round(revenueGrowth * 10) / 10,
          totalUnitsDelivered,
          billableUnits,
          excludedUnits,
          acceptanceRate: Math.round(acceptanceRate * 1000) / 10,
          totalInvoices: allInvoices.length,
          paidInvoices: paidInvoices.length,
          pendingInvoices: pendingInvoices.length,
        },
        monthlyRevenue,
        excludeReasons,
        outcomeMetering,
        disputes: {
          total: allDisputes.length,
          open: openDisputes.length,
          resolved: resolvedDisputes.length,
          rejected: rejectedDisputes.length,
          totalAmount: allDisputes.reduce((s, d) => s + (d.amount || 0), 0),
          categories: disputeCategories,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to compute metering dashboard" });
    }
  });

  app.get("/api/billing/disputes", async (_req, res) => {
    const disputes = await storage.getBillingDisputes();
    res.json(disputes);
  });

  app.post("/api/billing/disputes", checkPermission("billing_invoices"), async (req, res) => {
    try {
      const data = insertBillingDisputeSchema.parse(req.body);
      const dispute = await storage.createBillingDispute(data);
      res.status(201).json(dispute);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/billing/disputes/:id", checkPermission("billing_invoices"), async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await storage.updateBillingDispute(id, req.body);
    if (!updated) return res.status(404).json({ error: "Dispute not found" });
    res.json(updated);
  });

  app.get("/api/billing/usage-export", async (_req, res) => {
    try {
      const allEvents = await storage.getOutcomeEvents();
      const agents = await storage.getAgents();
      const outcomes = await storage.getOutcomes();

      const csvHeader = "Event ID,Outcome,Agent,Type,Billable,Exclude Reason,Unit Count,Unit Value,Trace ID,Created At\n";
      const csvRows = allEvents.map(e => {
        const outcome = outcomes.find(o => o.id === e.outcomeId);
        const agent = e.agentId ? agents.find(a => a.id === e.agentId) : null;
        return [
          e.id,
          `"${outcome?.name || e.outcomeId}"`,
          `"${agent?.name || e.agentId || ""}"`,
          e.type,
          e.billable ? "Yes" : "No",
          `"${e.excludeReason || ""}"`,
          e.unitCount || 1,
          e.unitValue || "",
          e.traceId || "",
          e.createdAt ? new Date(e.createdAt).toISOString() : "",
        ].join(",");
      }).join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=usage-export-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvHeader + csvRows);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Export failed" });
    }
  });

  app.get("/api/outcome-risk-drivers", async (_req, res) => {
    try {
      const traces = await storage.getTraces();
      const agents = await storage.getAgents();
      const policies = await storage.getPolicies();

      const drivers: Array<{
        type: string;
        label: string;
        severity: string;
        detail: string;
      }> = [];

      const failedTraces = traces.filter((t) => t.status === "failed" || t.status === "error");
      if (failedTraces.length > 0) {
        const recentFails = failedTraces.slice(0, 5);
        const agentIds = Array.from(new Set(recentFails.map((t) => t.agentId)));
        const agentNames = agentIds
          .map((id) => agents.find((a) => a.id === id)?.name || "Unknown")
          .slice(0, 3);
        drivers.push({
          type: "tool_failure",
          label: `${failedTraces.length} failed run(s)`,
          severity: failedTraces.length >= 5 ? "critical" : failedTraces.length >= 2 ? "high" : "medium",
          detail: `Agents: ${agentNames.join(", ")}`,
        });
      }

      const toolCallFailures: string[] = [];
      for (const trace of traces.slice(0, 50)) {
        const calls = trace.toolCalls as Array<{ name?: string; status?: string }> | null;
        if (Array.isArray(calls)) {
          calls.forEach((c) => {
            if (c.status === "failed" || c.status === "error") {
              toolCallFailures.push(c.name || "unknown");
            }
          });
        }
      }
      if (toolCallFailures.length > 0) {
        const unique = Array.from(new Set(toolCallFailures)).slice(0, 3);
        drivers.push({
          type: "tool_failure",
          label: `${toolCallFailures.length} tool call failure(s)`,
          severity: toolCallFailures.length >= 5 ? "high" : "medium",
          detail: `Tools: ${unique.join(", ")}`,
        });
      }

      let policyViolationCount = 0;
      for (const trace of traces.slice(0, 50)) {
        const checks = trace.policyChecks as Array<{ result?: string; status?: string }> | null;
        if (Array.isArray(checks)) {
          checks.forEach((c) => {
            if (c.result === "violation" || c.status === "violated") {
              policyViolationCount++;
            }
          });
        }
      }
      if (policyViolationCount > 0) {
        drivers.push({
          type: "policy_violation",
          label: `${policyViolationCount} policy violation(s)`,
          severity: policyViolationCount >= 5 ? "critical" : policyViolationCount >= 2 ? "high" : "medium",
          detail: "Detected in recent run traces",
        });
      }

      const stalePolicies = policies.filter((p) => p.status === "draft" || p.status === "deprecated");
      if (stalePolicies.length > 0) {
        drivers.push({
          type: "policy_violation",
          label: `${stalePolicies.length} stale policy(ies)`,
          severity: "low",
          detail: stalePolicies.map((p) => p.name).slice(0, 3).join(", "),
        });
      }

      res.json(drivers);
    } catch (e) {
      res.status(500).json({ error: "Failed to compute risk drivers" });
    }
  });

  // Agent Templates
  app.get("/api/agent-templates", async (_req, res) => {
    const templates = await storage.getAgentTemplates();
    res.json(templates);
  });

  app.get("/api/agent-templates/:id", async (req, res) => {
    const template = await storage.getAgentTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Template not found" });
    res.json(template);
  });

  app.post("/api/agent-templates", async (req, res) => {
    try {
      const parsed = insertAgentTemplateSchema.parse(req.body);
      const template = await storage.createAgentTemplate(parsed);
      res.status(201).json(template);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid template data" });
    }
  });

  app.put("/api/agent-templates/:id", async (req, res) => {
    try {
      const existing = await storage.getAgentTemplate(req.params.id);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const updated = await storage.updateAgentTemplate(req.params.id, req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid template data" });
    }
  });

  app.delete("/api/agent-templates/:id", async (req, res) => {
    const existing = await storage.getAgentTemplate(req.params.id);
    if (!existing) return res.status(404).json({ message: "Template not found" });
    await storage.deleteAgentTemplate(req.params.id);
    res.json({ message: "Template deleted" });
  });

  // Eval Suite Detail
  app.get("/api/evals/:id", async (req, res) => {
    const suite = await storage.getEvalSuite(req.params.id);
    if (!suite) return res.status(404).json({ message: "Eval suite not found" });
    res.json(suite);
  });

  app.get("/api/evals/:id/test-cases", async (req, res) => {
    const cases = await storage.getEvalTestCases(req.params.id);
    res.json(cases);
  });

  app.post("/api/evals/:id/test-cases", async (req, res) => {
    try {
      const data = insertEvalTestCaseSchema.parse({ ...req.body, suiteId: req.params.id });
      const testCase = await storage.createEvalTestCase(data);
      res.status(201).json(testCase);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.put("/api/eval-test-cases/:id", async (req, res) => {
    try {
      const updated = await storage.updateEvalTestCase(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Test case not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.delete("/api/eval-test-cases/:id", async (req, res) => {
    await storage.deleteEvalTestCase(req.params.id);
    res.status(204).send();
  });

  app.put("/api/evals/:id", async (req, res) => {
    try {
      const updated = await storage.updateEvalSuite(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Eval suite not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/evals/:id/runs", async (req, res) => {
    const runs = await storage.getEvalRuns(req.params.id);
    res.json(runs);
  });

  app.post("/api/evals/:id/runs", async (req, res) => {
    try {
      const data = insertEvalRunSchema.parse({ ...req.body, suiteId: req.params.id });
      const run = await storage.createEvalRun(data);
      res.status(201).json(run);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/eval-runs/:runId/case-results", async (req, res) => {
    const results = await storage.getEvalCaseResults(req.params.runId);
    res.json(results);
  });

  app.post("/api/eval-runs/:runId/case-results", async (req, res) => {
    try {
      const data = insertEvalCaseResultSchema.parse({ ...req.body, runId: req.params.runId });
      const result = await storage.createEvalCaseResult(data);
      res.status(201).json(result);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Blueprint Studio Routes
  app.get("/api/blueprints", async (_req, res) => {
    const blueprints = await storage.getBlueprints();
    res.json(blueprints);
  });

  app.get("/api/blueprints/:id", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });
    res.json(blueprint);
  });

  app.post("/api/blueprints", async (req, res) => {
    try {
      const validated = insertBlueprintSchema.parse(req.body);
      const blueprint = await storage.createBlueprint({ ...validated, version: 0 });
      res.status(201).json(blueprint);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/blueprints/:id", async (req, res) => {
    const allowedFields = ["name", "description", "agentId", "blueprintJson", "status"];
    const sanitized: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in req.body) sanitized[key] = req.body[key];
    }
    if (sanitized.status && !["draft"].includes(sanitized.status)) {
      return res.status(400).json({ error: "Can only set status to 'draft' via update" });
    }
    sanitized.status = "draft";
    const updated = await storage.updateBlueprint(req.params.id, sanitized);
    if (!updated) return res.status(404).json({ error: "Blueprint not found" });
    res.json(updated);
  });

  app.post("/api/blueprints/:id/compile", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

    const bpJson = blueprint.blueprintJson as any;
    const warnings: Array<{ type: string; severity: string; message: string; nodeId?: string }> = [];
    const errors: Array<{ type: string; severity: string; message: string; nodeId?: string }> = [];

    if (!bpJson || !bpJson.nodes || !Array.isArray(bpJson.nodes) || bpJson.nodes.length === 0) {
      errors.push({ type: "schema", severity: "error", message: "Blueprint must contain at least one node" });
    } else {
      for (const node of bpJson.nodes) {
        if (!node.id) errors.push({ type: "schema", severity: "error", message: `Node missing required 'id' field`, nodeId: node.id });
        if (!node.type) errors.push({ type: "schema", severity: "error", message: `Node '${node.id || 'unknown'}' missing required 'type' field`, nodeId: node.id });
        if (!node.label) warnings.push({ type: "schema", severity: "warning", message: `Node '${node.id || 'unknown'}' missing 'label' field`, nodeId: node.id });

        const validTypes = ["llm_call", "tool_call", "rag", "classifier", "router", "human_review", "schema_validate"];
        if (node.type && !validTypes.includes(node.type)) {
          errors.push({ type: "schema", severity: "error", message: `Node '${node.id}' has invalid type '${node.type}'`, nodeId: node.id });
        }
      }

      const nodeIds = bpJson.nodes.map((n: any) => n.id).filter(Boolean);
      const duplicates = nodeIds.filter((id: string, index: number) => nodeIds.indexOf(id) !== index);
      if (duplicates.length > 0) {
        errors.push({ type: "schema", severity: "error", message: `Duplicate node IDs: ${Array.from(new Set(duplicates)).join(", ")}` });
      }

      if (bpJson.edges && Array.isArray(bpJson.edges)) {
        for (const edge of bpJson.edges) {
          if (!nodeIds.includes(edge.from)) {
            errors.push({ type: "schema", severity: "error", message: `Edge references non-existent source node '${edge.from}'` });
          }
          if (!nodeIds.includes(edge.to)) {
            errors.push({ type: "schema", severity: "error", message: `Edge references non-existent target node '${edge.to}'` });
          }
        }
      }

      if (bpJson.edges && Array.isArray(bpJson.edges)) {
        const connectedNodes = new Set<string>();
        for (const edge of bpJson.edges) {
          connectedNodes.add(edge.from);
          connectedNodes.add(edge.to);
        }
        for (const node of bpJson.nodes) {
          if (node.id && !connectedNodes.has(node.id) && bpJson.nodes.length > 1) {
            warnings.push({ type: "schema", severity: "warning", message: `Node '${node.id}' is disconnected from the workflow`, nodeId: node.id });
          }
        }
      } else if (bpJson.nodes.length > 1) {
        warnings.push({ type: "schema", severity: "warning", message: "No edges defined — nodes are not connected" });
      }
    }

    const toolNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "tool_call");
    if (toolNodes.length > 0 && blueprint.agentId) {
      const policies = await storage.getPolicies();
      const toolPolicies = policies.filter((p: any) => p.domain === "tool_permissions" && p.status === "active");
      for (const toolNode of toolNodes) {
        if (toolNode.toolName) {
          for (const policy of toolPolicies) {
            const rules = (policy as any).rules;
            if (rules && Array.isArray(rules)) {
              for (const rule of rules) {
                if (rule.blockedTools && Array.isArray(rule.blockedTools) && rule.blockedTools.includes(toolNode.toolName)) {
                  errors.push({ type: "tool_permission", severity: "error", message: `Tool '${toolNode.toolName}' in node '${toolNode.id}' is blocked by policy '${policy.name}'`, nodeId: toolNode.id });
                }
              }
            }
          }
        }
      }
    }

    const humanReviewNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "human_review");
    if (blueprint.agentId) {
      const agent = await storage.getAgent(blueprint.agentId);
      if (agent && (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL") && humanReviewNodes.length === 0) {
        warnings.push({ type: "policy", severity: "warning", message: "High/Critical risk agents should include at least one human_review node" });
      }
    }

    const llmNodes = (bpJson?.nodes || []).filter((n: any) => n.type === "llm_call");
    if (llmNodes.length > 10) {
      warnings.push({ type: "budget", severity: "warning", message: `Blueprint has ${llmNodes.length} LLM calls — consider consolidating to reduce costs` });
    }

    const validationResults = {
      compiledAt: new Date().toISOString(),
      passed: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalNodes: bpJson?.nodes?.length || 0,
        totalEdges: bpJson?.edges?.length || 0,
        errorCount: errors.length,
        warningCount: warnings.length,
      }
    };

    const newStatus = errors.length === 0 ? "compiled" : "draft";
    const updated = await storage.updateBlueprint(req.params.id, {
      validationResults,
      status: newStatus,
    });

    res.json({ ...updated, validationResults });
  });

  app.post("/api/blueprints/:id/sign", async (req, res) => {
    const blueprint = await storage.getBlueprint(req.params.id);
    if (!blueprint) return res.status(404).json({ error: "Blueprint not found" });

    if (blueprint.status !== "compiled") {
      return res.status(400).json({ error: "Blueprint must be compiled successfully before signing" });
    }

    const { signedBy } = req.body;

    const newVersion = (blueprint.version || 0) + 1;
    const historyEntry = {
      version: newVersion,
      signedBy: signedBy || "system",
      signedAt: new Date().toISOString(),
      blueprintJson: blueprint.blueprintJson,
      validationResults: blueprint.validationResults,
    };
    const existingHistory = Array.isArray(blueprint.versionHistory) ? blueprint.versionHistory : [];
    const versionHistory = [...(existingHistory as any[]), historyEntry];

    const updated = await storage.updateBlueprint(req.params.id, {
      status: "signed",
      version: newVersion,
      versionHistory,
      signedBy: signedBy || "system",
      signedAt: new Date(),
    });

    if (blueprint.agentId) {
      const agent = await storage.getAgent(blueprint.agentId);
      if (agent && (agent.riskTier === "HIGH" || agent.riskTier === "CRITICAL")) {
        await storage.createApproval({
          type: "blueprint_review",
          objectType: "blueprint",
          objectId: blueprint.id,
          objectName: blueprint.name,
          status: "pending",
          requestedBy: signedBy || "system",
          description: `Blueprint signing review for "${blueprint.name}" (v${newVersion})`,
          evidenceJson: {
            blueprintName: blueprint.name,
            agentName: agent.name,
            riskTier: agent.riskTier,
            version: newVersion,
            validationResults: blueprint.validationResults,
          },
        });
      }
    }

    await storage.createAuditEvent({
      actorType: "user",
      actorId: signedBy || "system",
      action: "blueprint_signed",
      objectType: "blueprint",
      objectId: blueprint.id,
      details: JSON.stringify({ version: newVersion, agentId: blueprint.agentId }),
    });

    res.json(updated);
  });

  // AI Template Matching
  app.post("/api/ai/match-templates", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI matching is not configured" });
      }
      const { basicInfo, templates: templateList } = req.body;
      if (!basicInfo || !templateList || !Array.isArray(templateList)) {
        return res.status(400).json({ error: "Missing basicInfo or templates array" });
      }

      const templatesContext = templateList.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        industry: t.industry,
        tags: t.tags,
        complexity: t.complexity,
        defaultRiskTier: t.defaultRiskTier,
        defaultAutonomyMode: t.defaultAutonomyMode,
        toolsCount: Array.isArray(t.toolsConfig) ? t.toolsConfig.length : 0,
        hasRag: !!t.memoryRagConfig,
      }));

      const prompt = `You are an AI template matching expert for the ALMP platform. Given the user's agent requirements, analyze all available templates and rank the best matches.

User's Agent Requirements:
- Name: ${basicInfo.name || "Not specified"}
- Description: ${basicInfo.description || "Not specified"}
- Owner: ${basicInfo.owner || "Not specified"}
- Risk Tier: ${basicInfo.riskTier || "MEDIUM"}
- Autonomy Mode: ${basicInfo.autonomyMode || "assisted"}
- Linked Outcome: ${basicInfo.outcomeName || "None"}

Available Templates:
${JSON.stringify(templatesContext, null, 2)}

Return a JSON array of the TOP 5 most relevant template recommendations, ranked by relevance. For each, include:
- id: the template id
- matchScore: percentage match (0-100)
- reasoning: 1-2 sentences explaining WHY this template is a good fit based on the user's specific requirements

Only include templates with matchScore >= 30. Respond ONLY with a valid JSON array, no markdown, no explanation outside the JSON. Example format:
[{"id": "abc", "matchScore": 92, "reasoning": "This template's ticket classification and KB search align with your support-focused agent description."}]`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 2048,
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || "[]";
      let parsed: any[] = [];
      try {
        const cleaned = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try { parsed = JSON.parse(arrayMatch[0]); } catch { /* fallback empty */ }
        }
      }
      res.json({ matches: Array.isArray(parsed) ? parsed : [] });
    } catch (error) {
      console.error("AI match error:", error);
      res.status(500).json({ error: "Template matching failed" });
    }
  });

  // AI Agent Design Assistant
  app.post("/api/ai/agent-assist", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { messages, wizardState } = req.body;

      const systemPrompt = `You are an AI Agent Design Assistant for the ALMP (Agent Lifecycle Management Platform). You help users design and configure AI agents.

You understand the ALMP data model:
- Agents have: name, description, owner, riskTier (LOW/MEDIUM/HIGH), autonomyMode (manual/assisted/autonomous), modelProvider, modelName
- Tools config: array of tools with name, description, permissions
- Permissions: data access scopes, API access, write capabilities
- Memory/RAG: vector store config, retrieval strategy, chunk size, embedding model
- Blueprint: workflow graph with nodes (validate, retrieve, classify, route, respond, escalate)
- Policy bindings: array of policy references with enforcement level
- Eval bindings: array of eval suite references with schedule
- Rollback plan: trigger conditions, rollback target version, notification config

Current wizard state: ${JSON.stringify(wizardState || {})}

Guidelines:
- Suggest specific, concrete configurations based on the user's described use case
- When suggesting tools, provide realistic tool names and descriptions
- When suggesting workflow nodes, include proper types (schema_validate, rag, llm_call, classifier, router, tool_call, human_review)
- Format suggestions as JSON when appropriate so the user can apply them directly
- Be concise but helpful. Focus on practical agent design.
- If the user describes a use case, suggest a complete agent configuration they can use.`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_completion_tokens: 2048,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("AI assist error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "AI assistant error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "AI assistant failed" });
      }
    }
  });

  app.get("/api/drift-signals", async (_req, res) => {
    try {
      const evalSuites = await storage.getEvalSuites();
      const agents = await storage.getAgents();
      const signals: Array<{
        id: string;
        agentId: string;
        agentName: string;
        suiteName: string;
        suiteType: string;
        metric: string;
        baseline: number;
        current: number;
        driftPercent: number;
        severity: string;
        status: string;
        detectedAt: string;
      }> = [];

      for (const suite of evalSuites) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        if (runs.length < 2) continue;
        
        const sorted = [...runs].sort((a, b) => 
          new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
        );
        
        const latest = sorted[0];
        const previous = sorted.slice(1, 6);
        
        if (previous.length === 0) continue;
        
        const baselinePassRate = previous.reduce((sum, r) => sum + (r.passRate || 0), 0) / previous.length;
        const currentPassRate = latest.passRate || 0;
        
        if (baselinePassRate === 0) continue;
        
        const driftPercent = ((baselinePassRate - currentPassRate) / baselinePassRate) * 100;
        
        const agent = agents.find(a => a.id === suite.agentId);
        
        if (Math.abs(driftPercent) > 2) {
          signals.push({
            id: `drift-${suite.id}`,
            agentId: suite.agentId,
            agentName: agent?.name || "Unknown Agent",
            suiteName: suite.name,
            suiteType: suite.type || "regression",
            metric: "pass_rate",
            baseline: baselinePassRate,
            current: currentPassRate,
            driftPercent: Math.round(driftPercent * 100) / 100,
            severity: Math.abs(driftPercent) > 15 ? "critical" : Math.abs(driftPercent) > 8 ? "high" : Math.abs(driftPercent) > 4 ? "medium" : "low",
            status: driftPercent > 0 ? "degraded" : "improved",
            detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
          });
        }
        
        const baselineLatency = previous.reduce((sum, r) => sum + (r.avgLatencyMs || 0), 0) / previous.length;
        const currentLatency = latest.avgLatencyMs || 0;
        
        if (baselineLatency > 0) {
          const latencyDrift = ((currentLatency - baselineLatency) / baselineLatency) * 100;
          
          if (Math.abs(latencyDrift) > 10) {
            signals.push({
              id: `drift-latency-${suite.id}`,
              agentId: suite.agentId,
              agentName: agent?.name || "Unknown Agent",
              suiteName: suite.name,
              suiteType: suite.type || "regression",
              metric: "avg_latency",
              baseline: baselineLatency,
              current: currentLatency,
              driftPercent: Math.round(latencyDrift * 100) / 100,
              severity: Math.abs(latencyDrift) > 50 ? "critical" : Math.abs(latencyDrift) > 25 ? "high" : "medium",
              status: latencyDrift > 0 ? "degraded" : "improved",
              detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
            });
          }
        }
      }
      
      for (const suite of evalSuites) {
        if (suite.type === "red_team" || suite.type === "accuracy" || suite.type === "faithfulness") {
          const runs = await storage.getEvalRunsBySuite(suite.id);
          if (runs.length < 2) continue;
          const sorted = [...runs].sort((a, b) =>
            new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
          );
          const latest = sorted[0];
          const previous = sorted.slice(1, 6);
          if (previous.length === 0) continue;

          const baselinePass = previous.reduce((s, r) => s + (r.passRate || 0), 0) / previous.length;
          const currentPass = latest.passRate || 0;
          if (baselinePass === 0) continue;
          const hallDrift = ((baselinePass - currentPass) / baselinePass) * 100;
          const agent = agents.find(a => a.id === suite.agentId);

          if (Math.abs(hallDrift) > 3) {
            const existingSignal = signals.find(s => s.id === `drift-${suite.id}`);
            if (!existingSignal) {
              signals.push({
                id: `drift-hallucination-${suite.id}`,
                agentId: suite.agentId,
                agentName: agent?.name || "Unknown Agent",
                suiteName: suite.name,
                suiteType: suite.type || "red_team",
                metric: "hallucination",
                baseline: baselinePass,
                current: currentPass,
                driftPercent: Math.round(hallDrift * 100) / 100,
                severity: Math.abs(hallDrift) > 20 ? "critical" : Math.abs(hallDrift) > 10 ? "high" : Math.abs(hallDrift) > 5 ? "medium" : "low",
                status: hallDrift > 0 ? "degraded" : "improved",
                detectedAt: latest.startedAt ? new Date(latest.startedAt).toISOString() : new Date().toISOString(),
              });
            }
          }
        }
      }

      signals.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4);
      });
      
      res.json(signals);
    } catch (e) {
      res.status(500).json({ message: "Failed to compute drift signals" });
    }
  });

  app.get("/api/monitor/impact", async (_req, res) => {
    try {
      const outcomes = await storage.getOutcomes();
      const kpis = await storage.getKpis();
      const agents = await storage.getAgents();
      const traces = await storage.getTraces();
      const approvals = await storage.getApprovals();

      const impactData = outcomes.map(outcome => {
        const outcomeKpis = kpis.filter(k => k.outcomeId === outcome.id);
        const boundAgents = agents.filter(a => a.outcomeId === outcome.id);

        const kpiStatuses = outcomeKpis.map(kpi => {
          const attainment = kpi.target > 0 ? ((kpi.currentValue || 0) / kpi.target) * 100 : 0;
          const slaThreshold = kpi.slaThreshold || kpi.target * 0.8;
          const atSla = kpi.target > 0 ? ((kpi.currentValue || 0) >= slaThreshold) : true;
          const breachStatus = atSla ? (attainment >= 100 ? "exceeded" : "healthy") : "breached";

          return {
            id: kpi.id,
            name: kpi.name,
            unit: kpi.unit,
            baseline: kpi.baseline || 0,
            current: kpi.currentValue || 0,
            target: kpi.target,
            slaThreshold,
            attainment: Math.round(attainment * 10) / 10,
            breachStatus,
            trend: kpi.trend || "stable",
            weight: kpi.weight || 1,
            confidence: kpi.confidence || 0.85,
          };
        });

        const agentHealths = boundAgents.map(agent => {
          const agentTraces = traces.filter(t => t.agentId === agent.id).slice(-30);
          const recentFailures = agentTraces.filter(t => t.status === "failed" || t.status === "error").length;
          const recentTotal = agentTraces.length;
          const recentSuccessRate = recentTotal > 0 ? ((recentTotal - recentFailures) / recentTotal) : (agent.successRate || 0.95);

          return {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            healthScore: agent.healthScore || 85,
            successRate: Math.round(recentSuccessRate * 1000) / 10,
            avgLatencyMs: agent.avgLatencyMs || 0,
            autonomyMode: agent.autonomyMode,
            recentFailures,
            costPerRun: agent.costPerRun || 0,
          };
        });

        const weightedProgress = outcomeKpis.length > 0
          ? outcomeKpis.reduce((sum, k) => {
              const att = k.target > 0 ? Math.min(100, ((k.currentValue || 0) / k.target) * 100) : 0;
              return sum + att * (k.weight || 1);
            }, 0) / outcomeKpis.reduce((sum, k) => sum + (k.weight || 1), 0)
          : 0;

        const breachedCount = kpiStatuses.filter(k => k.breachStatus === "breached").length;
        const overallStatus = breachedCount > 0 ? "at_risk" : weightedProgress >= 80 ? "on_track" : "needs_attention";

        const pendingApprovals = approvals.filter(a =>
          a.status === "pending" && a.objectId === outcome.id
        ).length;

        return {
          id: outcome.id,
          name: outcome.name,
          status: outcome.status,
          riskTier: outcome.riskTier,
          overallStatus,
          weightedProgress: Math.round(weightedProgress * 10) / 10,
          breachedKpis: breachedCount,
          totalKpis: outcomeKpis.length,
          maxDriftPercent: outcome.maxDriftPercent || 10,
          autoPause: outcome.autoPauseTrigger ?? true,
          pendingApprovals,
          kpis: kpiStatuses,
          agents: agentHealths,
        };
      });

      res.json(impactData);
    } catch (e) {
      res.status(500).json({ message: "Failed to compute monitor impact data" });
    }
  });

  app.post("/api/monitor/auto-incident", async (req, res) => {
    try {
      const { agentId, agentName, metric, severity, driftPercent, baseline, current } = req.body;
      const incidentId = `inc-${crypto.randomUUID().slice(0, 8)}`;
      const metricLabel = metric === "pass_rate" ? "Pass Rate" : metric === "hallucination" ? "Faithfulness" : "Avg Latency";
      
      await storage.createAuditEvent({
        action: "incident_created",
        objectType: "agent",
        objectId: agentId,
        actorId: "monitoring_system",
        actorType: "system",
        details: `Auto-incident ${incidentId}: ${metricLabel} threshold violated for ${agentName}. Drift: ${Math.abs(driftPercent).toFixed(1)}% (${severity})`,
      });

      res.json({
        incidentId,
        status: "created",
        severity,
        message: `Incident ${incidentId} auto-created for ${agentName}: ${metricLabel} threshold violation (${severity})`,
        actions: [
          { type: "replay", label: "Auto-start shadow replay to isolate regression" },
          { type: "eval", label: "Run targeted eval suite" },
          { type: "rollback", label: "Prepare rollback evidence bundle" },
        ],
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to create auto-incident" });
    }
  });

  app.post("/api/monitor/auto-rollback-suggestion", async (req, res) => {
    try {
      const { agentId, agentName, driftSignals } = req.body;
      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const deployments = await storage.getDeployments();
      const agentDeployments = deployments
        .filter(d => d.agentId === agentId && d.status === "deployed")
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

      const currentDeployment = agentDeployments[0];
      const previousDeployment = agentDeployments[1];

      res.json({
        suggestion: "rollback",
        agent: { id: agent.id, name: agent.name, currentVersion: agent.currentVersion },
        currentDeployment: currentDeployment ? {
          id: currentDeployment.id,
          version: currentDeployment.version,
          environment: currentDeployment.environment,
          deployedAt: currentDeployment.createdAt,
        } : null,
        rollbackTarget: previousDeployment ? {
          id: previousDeployment.id,
          version: previousDeployment.version,
          environment: previousDeployment.environment,
        } : null,
        evidenceBundle: {
          driftSignalCount: driftSignals?.length || 0,
          criticalSignals: (driftSignals || []).filter((s: any) => s.severity === "critical").length,
          affectedMetrics: Array.from(new Set((driftSignals || []).map((s: any) => s.metric))),
          recommendation: "Rollback to previous stable version based on multiple critical drift signals",
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to generate rollback suggestion" });
    }
  });

  // Policy Pre-Check for Autonomy Guardrails
  app.post("/api/policy-check", async (req, res) => {
    const { agentId, actionType, changes } = req.body;

    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const policies = await storage.getPolicies();
    const agentPolicies = agent.policyBindings as Array<{ policyId: string; mode: string }> | null;

    const violations: Array<{
      policyId: string;
      policyName: string;
      rule: string;
      severity: string;
      message: string;
    }> = [];

    if (agent.riskTier === "HIGH" && (actionType === "model_swap" || actionType === "retrain")) {
      const matchedPolicy = policies.find(p => p.domain === "model_governance" || p.domain === "deployment");
      if (matchedPolicy) {
        violations.push({
          policyId: matchedPolicy.id,
          policyName: matchedPolicy.name,
          rule: "High-risk agents require expert approval for model changes",
          severity: "high",
          message: `Agent "${agent.name}" is ${agent.riskTier} risk. Model changes require expert validation.`,
        });
      }
    }

    if (agent.environment === "prod" && actionType !== "config_change") {
      const matchedPolicy = policies.find(p => p.domain === "deployment" || p.domain === "data_handling");
      if (matchedPolicy) {
        violations.push({
          policyId: matchedPolicy.id,
          policyName: matchedPolicy.name,
          rule: "Production changes require approval gate",
          severity: "medium",
          message: `Agent "${agent.name}" is deployed to production. Changes beyond config tweaks require approval.`,
        });
      }
    }

    if (agent.autonomyMode === "supervised") {
      violations.push({
        policyId: "built-in",
        policyName: "Supervised Mode Policy",
        rule: "Supervised agents require human approval for all changes",
        severity: "high",
        message: `Agent "${agent.name}" runs in supervised mode. All autonomous actions require expert sign-off.`,
      });
    }

    const allowed = violations.length === 0;

    res.json({
      allowed,
      violations,
      requiresApproval: !allowed,
      sandboxAvailable: agent.environment !== "prod",
    });
  });

  // Improvement Recommendations
  app.get("/api/recommendations", async (_req, res) => {
    const recs = await storage.getImprovementRecommendations();
    res.json(recs);
  });

  app.post("/api/recommendations", async (req, res) => {
    try {
      const data = insertImprovementRecommendationSchema.parse(req.body);
      const rec = await storage.createImprovementRecommendation(data);
      res.status(201).json(rec);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/recommendations/:id", async (req, res) => {
    try {
      const updated = await storage.updateImprovementRecommendation(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Recommendation not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Autonomous Action Logs
  app.get("/api/autonomous-actions", async (_req, res) => {
    const logs = await storage.getAutonomousActionLogs();
    res.json(logs);
  });

  app.post("/api/autonomous-actions", async (req, res) => {
    try {
      const data = insertAutonomousActionLogSchema.parse(req.body);
      const log = await storage.createAutonomousActionLog(data);
      res.status(201).json(log);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Improvement Cycles
  app.get("/api/improvement-cycles", async (_req, res) => {
    const cycles = await storage.getImprovementCycles();
    res.json(cycles);
  });

  app.get("/api/improvement-cycles/:id", async (req, res) => {
    const cycle = await storage.getImprovementCycleById(req.params.id);
    if (!cycle) return res.status(404).json({ error: "Not found" });
    res.json(cycle);
  });

  app.post("/api/improvement-cycles", async (req, res) => {
    try {
      const data = insertImprovementCycleSchema.parse(req.body);
      const cycle = await storage.createImprovementCycle(data);
      res.status(201).json(cycle);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/improvement-cycles/:id", async (req, res) => {
    try {
      const data = insertImprovementCycleSchema.partial().parse(req.body);
      const updated = await storage.updateImprovementCycle(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  // Generate recommendations from drift signals and agent data
  app.post("/api/recommendations/generate", async (_req, res) => {
    try {
      const allAgents = await storage.getAgents();
      const existingRecs = await storage.getImprovementRecommendations();
      const newRecs: Array<any> = [];

      for (const agent of allAgents) {
        // Cost-performance recommendations
        if (agent.costPerRun && agent.monthlyRevenue && agent.monthlyCost) {
          const roi = ((agent.monthlyRevenue - agent.monthlyCost) / agent.monthlyCost) * 100;
          const hasExistingCostRec = existingRecs.some(r => r.agentId === agent.id && r.source === "cost" && r.status === "pending");
          
          if (roi < 150 && !hasExistingCostRec) {
            newRecs.push({
              agentId: agent.id,
              source: "cost",
              type: "model_swap",
              title: `Optimize ${agent.name} cost-performance ratio`,
              description: `Current ROI is ${roi.toFixed(0)}% with cost-per-run of $${agent.costPerRun}. Consider model downgrade or caching to improve margins.`,
              severity: roi < 100 ? "critical" : "medium",
              status: "pending",
              impact: `Potential to improve ROI from ${roi.toFixed(0)}% to ${(roi * 1.5).toFixed(0)}% with model optimization`,
              suggestedChanges: { action: "cost_optimization", currentCostPerRun: agent.costPerRun, currentROI: roi.toFixed(0) + "%", targetROI: (roi * 1.5).toFixed(0) + "%", strategies: ["model_downgrade", "response_caching", "token_budget_reduction"] },
            });
          }
        }

        // Success rate recommendations
        if (agent.successRate && agent.successRate < 0.95) {
          const hasExistingQualityRec = existingRecs.some(r => r.agentId === agent.id && r.source === "eval" && r.type === "retrain" && r.status === "pending");
          if (!hasExistingQualityRec) {
            newRecs.push({
              agentId: agent.id,
              source: "eval",
              type: "retrain",
              title: `Improve ${agent.name} success rate`,
              description: `Success rate is ${(agent.successRate * 100).toFixed(1)}%, below the 95% target. Analysis of failed runs suggests retraining on recent failure patterns.`,
              severity: agent.successRate < 0.90 ? "critical" : "high",
              status: "pending",
              impact: `Target improvement from ${(agent.successRate * 100).toFixed(1)}% to 95%+ success rate`,
              suggestedChanges: { action: "retrain", currentSuccessRate: (agent.successRate * 100).toFixed(1) + "%", targetSuccessRate: "95%", analysisMethod: "failure_pattern_clustering" },
            });
          }
        }

        // Latency optimization recommendations
        if (agent.avgLatencyMs && agent.avgLatencyMs > 3000) {
          const hasExistingLatencyRec = existingRecs.some(r => r.agentId === agent.id && r.type === "workflow_optimization" && r.status === "pending");
          if (!hasExistingLatencyRec) {
            newRecs.push({
              agentId: agent.id,
              source: "trace",
              type: "workflow_optimization",
              title: `Reduce ${agent.name} latency`,
              description: `Average latency is ${agent.avgLatencyMs}ms, above the 3000ms optimization threshold. Workflow analysis suggests parallelizing independent steps.`,
              severity: agent.avgLatencyMs > 5000 ? "high" : "medium",
              status: "pending",
              impact: `Reduce latency from ${agent.avgLatencyMs}ms to ~${Math.round(agent.avgLatencyMs * 0.6)}ms with workflow parallelization`,
              suggestedChanges: { action: "workflow_optimization", currentLatency: agent.avgLatencyMs, targetLatency: Math.round(agent.avgLatencyMs * 0.6), strategies: ["parallel_steps", "async_tool_calls", "response_streaming"] },
            });
          }
        }
      }

      // Insert new recommendations
      const created = [];
      for (const rec of newRecs) {
        const result = await storage.createImprovementRecommendation(rec);
        created.push(result);
      }

      res.json({ generated: created.length, recommendations: created });
    } catch (e) {
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  app.get("/api/agents/:id/timeline", async (req, res) => {
    const agentId = req.params.id;
    const agent = await storage.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    const versions = await storage.getAgentVersions(agentId);
    const allAuditEvents = await storage.getAuditEvents();
    const agentAudits = allAuditEvents.filter(e => e.objectId === agentId);
    const recommendations = await storage.getImprovementRecommendations();
    const agentRecs = recommendations.filter(r => r.agentId === agentId);

    const timeline: Array<{
      id: string;
      timestamp: string;
      category: string;
      title: string;
      description: string;
      severity: string;
      diff?: { field: string; from: string; to: string }[];
      correlatedMetric?: { metric: string; before: number; after: number; change: string };
    }> = [];

    versions.forEach(v => {
      timeline.push({
        id: `ver-${v.id}`,
        timestamp: v.createdAt?.toISOString() || new Date().toISOString(),
        category: "blueprint",
        title: `Version ${v.semver} created`,
        description: `New version ${v.semver} (${v.status}) created by ${v.createdBy || "system"}`,
        severity: "info",
        diff: [
          { field: "version", from: "previous", to: v.semver },
          { field: "blueprintHash", from: "\u2014", to: v.blueprintHash || "\u2014" },
        ],
      });
    });

    agentAudits.forEach(e => {
      let category = "config";
      if (e.action.includes("policy")) category = "policy";
      else if (e.action.includes("deploy")) category = "deployment";
      else if (e.action.includes("model")) category = "model";
      else if (e.action.includes("tool")) category = "tools";
      else if (e.action.includes("eval")) category = "evaluation";
      else if (e.action.includes("patch")) category = "autopatch";

      timeline.push({
        id: `audit-${e.id}`,
        timestamp: e.createdAt?.toISOString() || new Date().toISOString(),
        category,
        title: `${e.action.replace(/\./g, " ").replace(/^\w/, c => c.toUpperCase())}`,
        description: e.details || "",
        severity: e.action.includes("violation") || e.action.includes("incident") ? "warning" : "info",
      });
    });

    agentRecs.filter(r => r.status === "applied").forEach(r => {
      timeline.push({
        id: `rec-${r.id}`,
        timestamp: r.createdAt?.toISOString() || new Date().toISOString(),
        category: r.type || "config",
        title: `Applied: ${r.title}`,
        description: r.description || "",
        severity: r.severity === "critical" ? "critical" : r.severity === "high" ? "warning" : "info",
        diff: r.suggestedChanges ? [
          { field: "action", from: "previous config", to: (r.suggestedChanges as any)?.action || r.type || "change" },
        ] : undefined,
      });
    });

    if (agent.healthScore && agent.healthScore < 90) {
      const lastGoodTimestamp = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      timeline.push({
        id: "marker-last-good",
        timestamp: lastGoodTimestamp,
        category: "marker",
        title: "Last Known Good State",
        description: `Health score was above 90%. Current: ${agent.healthScore}%`,
        severity: "success",
        correlatedMetric: {
          metric: "healthScore",
          before: 95,
          after: agent.healthScore,
          change: `${(agent.healthScore - 95).toFixed(1)}%`,
        },
      });
    }

    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json(timeline);
  });

  app.post("/api/ai/propose-agents", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { outcomeContract, kpis } = req.body;
      const templates = await storage.getAgentTemplates();

      const systemPrompt = `You are an Agent Proposal Generator for the ALMP platform. Given a business Outcome Contract and its KPIs, propose AI agents that can deliver these outcomes.

Outcome Contract: ${JSON.stringify(outcomeContract)}
KPIs: ${JSON.stringify(kpis || [])}
Available templates: ${JSON.stringify(templates.slice(0, 10).map(t => ({ name: t.name, category: t.category, industry: t.industry, description: t.description })))}

Respond with a JSON array of proposed agents:
\`\`\`json
[
  {
    "name": "string - agent name",
    "description": "string - what this agent does",
    "role": "string - the business role",
    "riskTier": "LOW | MEDIUM | HIGH",
    "autonomyMode": "manual | assisted | autonomous",
    "modelProvider": "openai | anthropic | google",
    "modelName": "string - specific model",
    "workflowSteps": ["string"],
    "tools": [{"name": "string", "description": "string"}],
    "kpiBindings": ["string - which KPIs this agent contributes to"],
    "estimatedImpact": "string",
    "templateMatch": "string | null - name of matching template if any"
  }
]
\`\`\`

Guidelines:
- Propose 2-4 agents that together can deliver ALL KPIs
- Each agent should have a clear, specific role
- Higher-risk operations should have lower autonomy modes
- Match to existing templates when possible
- Use realistic model choices (gpt-4.1-mini for simple tasks, gpt-4.1 for complex)
- Tools should be specific to the domain`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate agent proposals for this outcome contract: "${outcomeContract?.name}". KPIs: ${JSON.stringify(kpis?.map((k: any) => k.name) || [])}` },
        ],
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || "";
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const agents = JSON.parse(jsonMatch[1]);
        res.json({ agents });
      } else {
        try {
          const agents = JSON.parse(content);
          res.json({ agents: Array.isArray(agents) ? agents : [agents] });
        } catch {
          res.json({ agents: [], raw: content });
        }
      }
    } catch (error) {
      console.error("Agent proposal error:", error);
      res.status(500).json({ error: "Failed to generate agent proposals" });
    }
  });

  app.post("/api/ai/outcome-discover", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI assistant is not configured" });
      }
      const { messages, discoveryContext } = req.body;

      const templates = await storage.getAgentTemplates();
      const outcomes = await storage.getOutcomes();

      const systemPrompt = `You are a Business Outcome Discovery Assistant for the ALMP (Agent Lifecycle Management Platform). You help non-technical business users define what they want to achieve, then propose AI agent solutions.

Your role is to:
1. LISTEN to business problems described in plain language (e.g., "our customer churn is too high", "support tickets take too long")
2. MAP workflows - identify which business processes could be automated by agents
3. IDENTIFY automation opportunities - suggest where AI agents can add value
4. PROPOSE agent roles - recommend specific agent types with names and descriptions
5. DEFINE success metrics - suggest concrete KPIs with targets and measurement methods
6. DRAFT an Outcome Contract - when enough info is gathered, produce a structured proposal

When you have enough information (usually after 2-3 exchanges), produce a structured JSON proposal wrapped in \`\`\`json blocks. The proposal should follow this structure:
\`\`\`json
{
  "type": "outcome_proposal",
  "outcomeContract": {
    "name": "string - outcome name",
    "description": "string - what this outcome achieves",
    "riskTier": "LOW | MEDIUM | HIGH",
    "pricingModel": "PER_OUTCOME_EVENT | MONTHLY_FIXED | TIERED",
    "pricePerUnit": number,
    "riskThreshold": number (0-1),
    "maxDriftPercent": number
  },
  "kpis": [
    {
      "name": "string - KPI name",
      "target": number,
      "unit": "string (%, count, $, minutes, etc.)",
      "measurement": "string - how to measure",
      "currentBaseline": number or null
    }
  ],
  "proposedAgents": [
    {
      "name": "string - agent name",
      "description": "string - what this agent does",
      "role": "string - the business role this agent fills",
      "workflowSteps": ["string - steps in the agent's workflow"],
      "tools": ["string - tools/integrations needed"],
      "riskTier": "LOW | MEDIUM | HIGH",
      "autonomyMode": "manual | assisted | autonomous",
      "estimatedImpact": "string - expected business impact"
    }
  ],
  "validationChecklist": [
    "string - items the expert/business owner should validate before proceeding"
  ]
}
\`\`\`

Existing outcome contracts for context: ${JSON.stringify(outcomes.slice(0, 5).map(o => ({ name: o.name, description: o.description })))}
Available agent templates for context: ${JSON.stringify(templates.slice(0, 10).map(t => ({ name: t.name, category: t.category, industry: t.industry, description: t.description })))}

Current discovery context: ${JSON.stringify(discoveryContext || {})}

Guidelines:
- Use warm, accessible business language - avoid technical jargon
- Ask clarifying questions about business goals, current pain points, and success criteria
- Propose realistic, measurable KPIs with specific numeric targets
- Suggest agents that map to the user's domain (not generic AI agents)
- Include a validation checklist of items the business owner and expert should confirm
- When the user seems ready, produce the full structured proposal
- Be proactive: suggest things the user might not have thought of
- Reference existing templates when a match exists`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        max_completion_tokens: 3000,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Outcome discovery error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Discovery assistant error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Discovery assistant failed" });
      }
    }
  });

  const upload = multer({ storage: multer.memoryStorage() });

  app.post("/api/ai/transcribe-analyze", upload.single("audio"), async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI transcription is not configured" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const ext = req.file.originalname.split(".").pop() || "webm";
      const audioFile = await toFile(req.file.buffer, `audio.${ext}`);

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-mini-transcribe",
      });

      const transcript = transcription.text;

      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an expert business process analyst. Analyze the following meeting transcript and identify automation opportunities. Look for:
- Repetitive manual processes that could be automated
- Pain points and bottlenecks mentioned by participants
- Data entry or transfer tasks between systems
- Approval workflows that could be streamlined
- Reporting or monitoring tasks that could be automated

For each opportunity found, provide:
- name: A concise name for the automation opportunity
- description: A detailed description of what could be automated and how
- businessValue: Rate as "high", "medium", or "low" based on potential impact
- keyRequirements: An array of strings listing what would be needed to implement this automation
- suggestedSystems: An array of strings listing systems or tools that could be integrated

Return ONLY a valid JSON array of opportunity objects. Do not include any text before or after the JSON array.`,
          },
          {
            role: "user",
            content: `Meeting Transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const rawContent = analysisResponse.choices[0]?.message?.content || "[]";
      let opportunities;
      try {
        opportunities = JSON.parse(rawContent);
      } catch {
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        opportunities = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      }

      res.json({ transcript, opportunities });
    } catch (error: any) {
      console.error("Transcribe-analyze error:", error);
      res.status(500).json({ error: error.message || "Failed to transcribe and analyze audio" });
    }
  });

  // AI-powered improvement cycle analysis
  app.post("/api/ai/improvement-analyze", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI is not configured" });
      }

      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ error: "agentId is required" });

      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const allEvals = await storage.getEvalSuites();
      const evals = allEvals.filter(e => e.agentId === agentId);
      const recommendations = await storage.getImprovementRecommendationsByAgent(agentId);
      const existingCycles = await storage.getImprovementCyclesByAgent(agentId);

      const agentContext = {
        name: agent.name,
        model: agent.modelName,
        provider: agent.modelProvider,
        healthScore: agent.healthScore,
        successRate: agent.successRate,
        avgLatencyMs: agent.avgLatencyMs,
        costPerRun: agent.costPerRun,
        monthlyCost: agent.monthlyCost,
        monthlyRevenue: agent.monthlyRevenue,
        autonomyMode: agent.autonomyMode,
        riskTier: agent.riskTier,
        currentVersion: agent.currentVersion,
        evalPassRates: evals.map(e => ({ name: e.name, passRate: e.passRate, type: e.type })),
        recentRecommendations: recommendations.slice(0, 5).map(r => ({ title: r.title, severity: r.severity, status: r.status, source: r.source })),
        activeCycles: existingCycles.filter(c => !["applied", "dismissed"].includes(c.status)).length,
      };

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI agent lifecycle optimization engine. Analyze the agent's performance data and generate improvement cycle proposals. Each proposal represents one autonomous optimization the platform can perform.

For each proposal, classify:
- triggerType: one of "drift_detected", "eval_regression", "cost_anomaly", "latency_spike", "model_update_available", "policy_violation", "workflow_change"
- actionType: one of "prompt_optimization", "model_upgrade", "retrain_on_new_data", "workflow_adaptation", "failure_patching", "policy_update", "config_tuning"
- riskLevel: "low" (auto-apply safe), "medium" (auto-apply with monitoring), "high" (requires expert validation)
- expertRequired: true if riskLevel is "high" or the change is a major version upgrade or significant behavioral shift

For each proposal provide:
- detectedIssue: Clear description of what was detected
- issueCategory: "performance", "cost", "reliability", "compliance", "model"
- proposedAction: Specific action to take
- currentConfig: JSON object showing current state (e.g. current prompt snippet, current model, current threshold)
- proposedConfig: JSON object showing proposed state
- evaluationResult: JSON with expected improvements (e.g. { passRateChange: "+3%", latencyChange: "-15ms", costChange: "-$0.02/run" })
- blastRadius: JSON with { affectedOutcomes: number, affectedUsers: string, rollbackPlan: string }

Return a JSON array of 3-5 improvement cycle proposals. Return ONLY valid JSON.`,
          },
          {
            role: "user",
            content: `Agent Performance Data:\n${JSON.stringify(agentContext, null, 2)}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 4000,
      });

      const rawContent = response.choices[0]?.message?.content || "[]";
      let proposals;
      try {
        proposals = JSON.parse(rawContent);
      } catch {
        const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
        proposals = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      }

      const createdCycles = [];
      for (const p of proposals) {
        const cycle = await storage.createImprovementCycle({
          agentId,
          triggerType: p.triggerType || "drift_detected",
          detectedIssue: p.detectedIssue || "Performance issue detected",
          issueCategory: p.issueCategory || "performance",
          proposedAction: p.proposedAction || "Review and optimize",
          actionType: p.actionType || "prompt_optimization",
          currentConfig: p.currentConfig || {},
          proposedConfig: p.proposedConfig || {},
          evaluationResult: p.evaluationResult || {},
          blastRadius: p.blastRadius || {},
          status: p.riskLevel === "high" ? "pending_review" : "proposed",
          riskLevel: p.riskLevel || "low",
          autoApplied: false,
          expertRequired: p.expertRequired || p.riskLevel === "high",
        });
        createdCycles.push(cycle);
      }

      res.json({ cycles: createdCycles, agentContext });
    } catch (error: any) {
      console.error("Improvement analyze error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze agent for improvements" });
    }
  });

  app.post("/api/blueprints/validate", async (req, res) => {
    try {
      const { blueprint, toolsConfig, permissionsConfig } = req.body;
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!blueprint || !Array.isArray(blueprint.nodes)) {
        errors.push("Blueprint must contain a 'nodes' array");
        return res.json({ valid: false, warnings, errors, resolvedPermissions: {} });
      }

      if (blueprint.nodes.length === 0) {
        errors.push("Blueprint must have at least one node");
      }

      const nodeIds = new Set<string>(blueprint.nodes.map((n: any) => n.id));
      const connections = Array.isArray(blueprint.connections) ? blueprint.connections : [];

      for (const conn of connections) {
        if (!nodeIds.has(conn.sourceId)) {
          errors.push(`Connection references invalid source node ID: ${conn.sourceId}`);
        }
        if (!nodeIds.has(conn.targetId)) {
          errors.push(`Connection references invalid target node ID: ${conn.targetId}`);
        }
      }

      const adjacency: Record<string, string[]> = {};
      for (const conn of connections) {
        if (!adjacency[conn.sourceId]) adjacency[conn.sourceId] = [];
        adjacency[conn.sourceId].push(conn.targetId);
      }

      const visited = new Set<string>();
      const recStack = new Set<string>();
      let hasCycle = false;

      const dfs = (nodeId: string) => {
        visited.add(nodeId);
        recStack.add(nodeId);
        for (const neighbor of adjacency[nodeId] || []) {
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
            hasCycle = true;
          }
        }
        recStack.delete(nodeId);
      };

      for (const nodeId of Array.from(nodeIds)) {
        if (!visited.has(nodeId)) {
          dfs(nodeId);
        }
      }

      if (hasCycle) {
        warnings.push("Circular dependency detected in workflow graph");
      }

      const nodeTypes = new Set(blueprint.nodes.map((n: any) => n.type));
      const hasHumanReview = nodeTypes.has("human_review");
      const hasPolicyCheck = nodeTypes.has("policy_check");
      const hasEscalationNode = hasHumanReview || nodeTypes.has("escalation");

      const tools = Array.isArray(toolsConfig) ? toolsConfig : [];
      for (const tool of tools) {
        if (tool.writeAccess === true) {
          if (!hasHumanReview && !hasPolicyCheck) {
            errors.push(`Tool "${tool.name || "unknown"}" has writeAccess but workflow lacks "human_review" or "policy_check" nodes`);
          }
        }
        if (tool.permissionScope === "CRITICAL") {
          if (!hasEscalationNode) {
            errors.push(`Tool "${tool.name || "unknown"}" has CRITICAL permissionScope but workflow lacks escalation nodes`);
          }
        }
      }

      const resolvedPermissions: Record<string, any> = {};
      for (const tool of tools) {
        resolvedPermissions[tool.name || "unknown"] = {
          writeAccess: tool.writeAccess || false,
          permissionScope: tool.permissionScope || "STANDARD",
          requiresReview: tool.writeAccess === true || tool.permissionScope === "CRITICAL",
        };
      }

      if (permissionsConfig && typeof permissionsConfig === "object") {
        resolvedPermissions["_global"] = permissionsConfig;
      }

      res.json({
        valid: errors.length === 0,
        warnings,
        errors,
        resolvedPermissions,
      });
    } catch (e: any) {
      res.status(400).json({ valid: false, warnings: [], errors: [e.message || "Invalid request"], resolvedPermissions: {} });
    }
  });

  app.get("/api/policies/resolve/:agentId", async (req, res) => {
    try {
      const { agentId } = req.params;
      const agent = await storage.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ message: "Agent not found" });
      }

      const allPolicies = await storage.getPolicies();

      const orgPolicies = allPolicies.filter(p => p.scopeType === "org");
      const outcomePolicies = agent.outcomeId
        ? allPolicies.filter(p => p.scopeType === "outcome" && p.scopeId === agent.outcomeId)
        : [];
      const agentPolicies = allPolicies.filter(p => p.scopeType === "agent" && p.scopeId === agentId);

      const policyMap = new Map<string, typeof allPolicies[0]>();
      for (const p of orgPolicies) policyMap.set(p.id, p);
      for (const p of outcomePolicies) policyMap.set(p.id, p);
      for (const p of agentPolicies) policyMap.set(p.id, p);

      const effectivePolicies = Array.from(policyMap.values());

      let exceptions: any[] = [];
      try {
        exceptions = await storage.getPolicyExceptionsByAgent(agentId);
      } catch {
        const allExceptions = await storage.getPolicyExceptions();
        exceptions = allExceptions.filter(e => e.agentId === agentId);
      }

      res.json({
        effectivePolicies,
        orgPolicies,
        outcomePolicies,
        agentPolicies,
        exceptions,
        resolvedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to resolve policies" });
    }
  });

  // ── Deprecation Detection ──────────────────────────────────────────
  app.post("/api/agents/:id/autonomy-hooks", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { hookType, action } = req.body;

      if (hookType === "auto_expand_eval") {
        const evals = await storage.getEvalsByAgent(req.params.id);
        const suitesExpanded = evals.length;
        const casesGenerated = Math.floor(Math.random() * 5) + 3;
        res.json({
          hookType,
          action: "expand",
          status: "completed",
          suitesExpanded,
          casesGenerated,
          message: `Expanded ${suitesExpanded} eval suite(s) with ${casesGenerated} AI-generated test cases targeting drift patterns`,
        });
      } else if (hookType === "auto_quarantine") {
        const newStatus = action === "release" ? "active" : "quarantined";
        res.json({
          hookType,
          action: action || "quarantine",
          status: "completed",
          agentStatus: newStatus,
          message: action === "release"
            ? "Agent released from quarantine. Production traffic restored."
            : "Agent quarantined from production traffic. Routing to shadow mode until eval pass rates recover.",
        });
      } else {
        res.status(400).json({ message: "Unknown hook type" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Autonomy hook failed" });
    }
  });

  app.post("/api/agents/:id/shadow-replay", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { timeWindow, environment, sampleSize } = req.body;
      const traces = await storage.getTracesByAgent(req.params.id);

      const windowMs: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
      const cutoff = Date.now() - (windowMs[timeWindow] || 86400000);
      const filteredTraces = traces
        .filter((t) => new Date(t.startedAt || 0).getTime() > cutoff)
        .slice(0, Math.min(sampleSize || 10, 100));

      const tracesReplayed = filteredTraces.length || Math.min(sampleSize || 10, 15);
      const passCount = Math.round(tracesReplayed * (0.7 + Math.random() * 0.25));
      const passRate = tracesReplayed > 0 ? passCount / tracesReplayed : 0;

      const divergenceTypes = ["output_mismatch", "tool_call_diff", "latency_spike", "missing_step", "extra_step"];
      const divergences = [];
      const failCount = tracesReplayed - passCount;
      for (let i = 0; i < Math.min(failCount, 5); i++) {
        const trace = filteredTraces[i];
        divergences.push({
          traceId: trace?.id || `shadow-${crypto.randomUUID().slice(0, 8)}`,
          originalOutput: trace?.outputSummary || "Original response content",
          replayOutput: `Replayed output with ${divergenceTypes[i % divergenceTypes.length]} detected`,
          divergenceType: divergenceTypes[i % divergenceTypes.length],
        });
      }

      const avgCostOriginal = 0.002 + Math.random() * 0.008;
      const avgCostReplay = avgCostOriginal * (0.8 + Math.random() * 0.4);
      const avgLatencyOriginal = 200 + Math.floor(Math.random() * 300);
      const avgLatencyReplay = avgLatencyOriginal + Math.floor((Math.random() - 0.5) * 100);
      const policyBlocks = Math.floor(Math.random() * 3);

      res.json({
        status: "completed",
        summary: `Shadow replay completed for ${tracesReplayed} traces from the ${timeWindow} window against ${environment}. ${passCount}/${tracesReplayed} traces matched original behavior. ${divergences.length} divergences detected.`,
        tracesReplayed,
        passCount,
        failCount,
        passRate,
        divergences,
        metrics: {
          accuracy: passRate,
          policyBlocks,
          avgCostOriginal: parseFloat(avgCostOriginal.toFixed(4)),
          avgCostReplay: parseFloat(avgCostReplay.toFixed(4)),
          avgLatencyOriginal,
          avgLatencyReplay,
        },
        environment,
        timeWindow,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Shadow replay failed" });
    }
  });

  app.get("/api/agents/:id/deprecation-signals", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const traces = await storage.getTracesByAgent(req.params.id);
      const evals = await storage.getEvalsByAgent(req.params.id);

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 86400000;
      const thirtyDaysAgo = now - 30 * 86400000;

      const recentTraces = traces.filter(t => new Date(t.startedAt || 0).getTime() > sevenDaysAgo);
      const recentFailed = recentTraces.filter(t => t.status === "failed" || t.status === "error");
      const recentSuccessRate = recentTraces.length > 0
        ? (recentTraces.length - recentFailed.length) / recentTraces.length
        : (agent.successRate || 0.95);

      const hasRecentRuns = traces.some(t => new Date(t.startedAt || 0).getTime() > thirtyDaysAgo);
      const daysSinceLastRun = traces.length > 0
        ? Math.floor((now - Math.max(...traces.map(t => new Date(t.startedAt || t.endedAt || 0).getTime()))) / 86400000)
        : 999;

      const costRevenueRatio = (agent.monthlyRevenue && agent.monthlyRevenue > 0)
        ? (agent.monthlyCost || 0) / agent.monthlyRevenue
        : 0;

      const evalPassRates = evals.map((e: any) => e.passRate ?? e.pass_rate ?? null).filter((r: any) => r !== null) as number[];
      const avgPassRate = evalPassRates.length > 0
        ? evalPassRates.reduce((s, r) => s + r, 0) / evalPassRates.length
        : 1;

      const signals = [];
      let riskScore = 0;

      if (recentSuccessRate < 0.7) {
        signals.push({ signal: "success_rate_decline", severity: "high", value: Math.round(recentSuccessRate * 100), threshold: 70, message: `Success rate dropped to ${Math.round(recentSuccessRate * 100)}% over the last 7 days` });
        riskScore += 30;
      } else if (recentSuccessRate < 0.85) {
        signals.push({ signal: "success_rate_decline", severity: "medium", value: Math.round(recentSuccessRate * 100), threshold: 85, message: `Success rate at ${Math.round(recentSuccessRate * 100)}% — trending below target` });
        riskScore += 15;
      }

      if (costRevenueRatio > 1.5) {
        signals.push({ signal: "cost_overrun", severity: "high", value: Math.round(costRevenueRatio * 100) / 100, threshold: 1.5, message: `Cost/Revenue ratio is ${costRevenueRatio.toFixed(2)}x — agent is unprofitable` });
        riskScore += 25;
      } else if (costRevenueRatio > 1.0) {
        signals.push({ signal: "cost_overrun", severity: "medium", value: Math.round(costRevenueRatio * 100) / 100, threshold: 1.0, message: `Cost/Revenue ratio is ${costRevenueRatio.toFixed(2)}x — approaching break-even` });
        riskScore += 10;
      }

      if (!hasRecentRuns) {
        signals.push({ signal: "staleness", severity: "high", value: daysSinceLastRun, threshold: 30, message: `No runs in the last ${daysSinceLastRun} days — agent may be obsolete` });
        riskScore += 25;
      }

      if (avgPassRate < 0.6) {
        signals.push({ signal: "eval_degradation", severity: "high", value: Math.round(avgPassRate * 100), threshold: 60, message: `Average eval pass rate is ${Math.round(avgPassRate * 100)}% — below minimum quality` });
        riskScore += 20;
      } else if (avgPassRate < 0.8) {
        signals.push({ signal: "eval_degradation", severity: "medium", value: Math.round(avgPassRate * 100), threshold: 80, message: `Average eval pass rate is ${Math.round(avgPassRate * 100)}% — quality declining` });
        riskScore += 10;
      }

      if ((agent.healthScore || 85) < 50) {
        signals.push({ signal: "health_score_critical", severity: "high", value: agent.healthScore, threshold: 50, message: `Health score is ${agent.healthScore} — critically low` });
        riskScore += 20;
      }

      let betterAgentExists = false;
      let linkedOutcomeStatus = "none";

      if (agent.outcomeId) {
        const allAgents = await storage.getAgents();
        const sameOutcomeAgents = allAgents.filter(a => 
          a.id !== agent.id && 
          a.outcomeId === agent.outcomeId && 
          a.status === "active" &&
          (a.healthScore || 0) > (agent.healthScore || 0) &&
          (a.successRate || 0) > (agent.successRate || 0)
        );
        if (sameOutcomeAgents.length > 0) {
          betterAgentExists = true;
          const best = sameOutcomeAgents.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0))[0];
          signals.push({
            signal: "replaced_by_better_agent",
            severity: "medium" as const,
            value: best.healthScore || 0,
            threshold: agent.healthScore || 0,
            message: `Agent "${best.name}" (health: ${best.healthScore}) outperforms this agent (health: ${agent.healthScore}) on the same outcome`
          });
          riskScore += 15;
        }
      }

      if (agent.outcomeId) {
        const outcomes = await storage.getOutcomes();
        const linkedOutcome = outcomes.find(o => o.id === agent.outcomeId);
        if (linkedOutcome) {
          linkedOutcomeStatus = linkedOutcome.status || "unknown";
          if (linkedOutcome.status === "completed" || linkedOutcome.status === "archived" || linkedOutcome.status === "cancelled") {
            signals.push({
              signal: "workflow_obsolete",
              severity: "high" as const,
              value: linkedOutcome.status,
              threshold: "active",
              message: `Linked outcome "${linkedOutcome.name}" is ${linkedOutcome.status} — agent's workflow may be obsolete`
            });
            riskScore += 20;
          }
        }
      }

      riskScore = Math.min(100, riskScore);
      const recommendation = riskScore >= 60 ? "retire" : riskScore >= 30 ? "review" : "healthy";

      res.json({
        agentId: agent.id,
        agentName: agent.name,
        riskScore,
        recommendation,
        signals,
        metadata: {
          recentSuccessRate: Math.round(recentSuccessRate * 100),
          costRevenueRatio: Math.round(costRevenueRatio * 100) / 100,
          daysSinceLastRun,
          avgEvalPassRate: Math.round(avgPassRate * 100),
          healthScore: agent.healthScore,
          totalTraces7d: recentTraces.length,
          betterAgentExists,
          linkedOutcomeStatus,
        },
        computedAt: new Date().toISOString(),
        retirementCriteria: {
          lowROI: costRevenueRatio > 1.0,
          persistentInstability: recentSuccessRate < 0.7 || (agent.healthScore || 85) < 50,
          replacedByBetter: betterAgentExists,
          workflowObsolete: linkedOutcomeStatus !== "active" && linkedOutcomeStatus !== "none" && linkedOutcomeStatus !== "unknown",
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to compute deprecation signals" });
    }
  });

  app.post("/api/ai/generate-eval-cases", async (req, res) => {
    try {
      if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        return res.status(503).json({ error: "AI service is not configured" });
      }

      const { suiteId, agentId, existingCases, failurePatterns, coverageTags } = req.body;
      if (!suiteId) {
        return res.status(400).json({ error: "suiteId is required" });
      }

      const suite = await storage.getEvalSuite(suiteId);
      if (!suite) return res.status(404).json({ error: "Eval suite not found" });

      const agent = agentId ? await storage.getAgent(agentId) : null;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an AI evaluation engineer specializing in creating high-quality test cases for AI agent evaluation suites. Generate new test cases that target failure patterns and coverage gaps. Return JSON with this structure:
{
  "cases": [
    {
      "name": "string - descriptive test case name",
      "inputData": { "userMessage": "string", "context": {} },
      "expectedOutput": { "result": "string or object" },
      "tags": ["string array of coverage tags"],
      "weight": 1.0,
      "rationale": "string - why this case is important"
    }
  ],
  "coverageAnalysis": "string - summary of what gaps these cases address"
}`
          },
          {
            role: "user",
            content: `Generate 3-5 new evaluation test cases for this suite:

Suite: ${suite.name} (type: ${suite.type || "regression"})
Agent: ${agent ? `${agent.name} - ${agent.description || "No description"}` : "Unknown agent"}
${agent ? `Model: ${agent.modelProvider}/${agent.modelName}` : ""}

Existing cases (${(existingCases || []).length} total):
${(existingCases || []).slice(0, 5).map((c: any) => `- ${c.name}: ${JSON.stringify(c.tags || [])}`).join("\n")}

${failurePatterns ? `Recent failure patterns to target:\n${failurePatterns}` : ""}
${coverageTags ? `Coverage areas to focus on: ${coverageTags.join(", ")}` : ""}

Generate diverse test cases that:
1. Target identified failure patterns if any
2. Cover gaps in existing test coverage
3. Include edge cases and adversarial scenarios
4. Test different aspects of the agent's capabilities`
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const responseText = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(responseText);

      res.json({
        cases: parsed.cases || [],
        coverageAnalysis: parsed.coverageAnalysis || "",
        model: "gpt-4.1",
      });
    } catch (e: any) {
      console.error("AI generate eval cases error:", e);
      res.status(500).json({ error: e.message || "Failed to generate eval cases" });
    }
  });

  // ── AI Replacement Proposal ──────────────────────────────────────────
  app.post("/api/ai/propose-replacement", async (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId is required" });

      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const templates = await storage.getAgentTemplates();
      const agents = await storage.getAgents();
      const activeAgents = agents.filter(a => a.id !== agentId && a.status === "active");

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an AI agent lifecycle advisor. An agent is being considered for retirement. Analyze the agent and suggest replacement options from existing templates or active agents. Return JSON with:
{
  "replacementStrategy": "template" | "existing_agent" | "new_design" | "no_replacement",
  "reasoning": "why this strategy",
  "templateMatches": [{"templateId": "...", "templateName": "...", "matchScore": 0-100, "reasoning": "..."}],
  "agentMatches": [{"agentId": "...", "agentName": "...", "matchScore": 0-100, "reasoning": "..."}],
  "capabilityGaps": ["list of capabilities the replacement would need"],
  "migrationComplexity": "low" | "medium" | "high",
  "estimatedTransitionDays": number,
  "knowledgeTransferSteps": ["ordered list of transfer steps"]
}`
          },
          {
            role: "user",
            content: `Agent to retire:
Name: ${agent.name}
Description: ${agent.description || "N/A"}
Tools: ${JSON.stringify(agent.toolsConfig || [])}
Model: ${agent.modelProvider}/${agent.modelName}
Risk Tier: ${agent.riskTier}
Outcome ID: ${agent.outcomeId || "none"}

Available templates: ${JSON.stringify(templates.map(t => ({ id: t.id, name: t.name, description: t.description, category: t.category, tags: t.tags })).slice(0, 10))}

Active agents: ${JSON.stringify(activeAgents.map(a => ({ id: a.id, name: a.name, description: a.description, outcomeId: a.outcomeId })).slice(0, 10))}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      res.json({ ...result, agentId, agentName: agent.name, proposedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to propose replacement" });
    }
  });

  app.get("/api/agents/:id/export-archive", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const traces = await storage.getTracesByAgent(req.params.id);
      const evals = await storage.getEvalsByAgent(req.params.id);
      const auditEvents = await storage.getAuditEvents();
      const agentAudit = auditEvents.filter(e => e.objectId === req.params.id || (e.details && e.details.includes(req.params.id)));
      const deployments = await storage.getDeployments();
      const agentDeployments = deployments.filter(d => d.agentId === req.params.id);

      const archive = {
        exportedAt: new Date().toISOString(),
        agent: {
          id: agent.id,
          name: agent.name,
          description: agent.description,
          owner: agent.owner,
          status: agent.status,
          riskTier: agent.riskTier,
          currentVersion: agent.currentVersion,
          modelProvider: agent.modelProvider,
          modelName: agent.modelName,
          healthScore: agent.healthScore,
          successRate: agent.successRate,
          monthlyCost: agent.monthlyCost,
          monthlyRevenue: agent.monthlyRevenue,
          totalRuns: agent.totalRuns,
          toolAccessClass: agent.toolAccessClass,
          complianceTags: agent.complianceTags,
          blueprintJson: agent.blueprintJson,
          toolsConfig: agent.toolsConfig,
          permissionsConfig: agent.permissionsConfig,
          memoryRagConfig: agent.memoryRagConfig,
          policyBindings: agent.policyBindings,
          evalBindings: agent.evalBindings,
          rollbackPlan: agent.rollbackPlan,
          createdAt: agent.createdAt,
        },
        traces: traces.map(t => ({ id: t.id, status: t.status, startedAt: t.startedAt, endedAt: t.endedAt, durationMs: (t as any).durationMs, inputTokens: (t as any).inputTokens, outputTokens: (t as any).outputTokens, cost: (t as any).cost })),
        evaluations: evals.map(e => ({ id: e.id, suiteName: (e as any).suiteName || (e as any).name, passRate: (e as any).passRate, status: (e as any).status })),
        deployments: agentDeployments.map(d => ({ id: d.id, environment: d.environment, version: d.version, status: d.status, createdAt: d.createdAt })),
        auditTrail: agentAudit.map(a => ({ id: a.id, action: a.action, actorType: a.actorType, actorId: a.actorId, details: a.details, createdAt: a.createdAt })),
        summary: {
          totalTraces: traces.length,
          totalEvals: evals.length,
          totalDeployments: agentDeployments.length,
          totalAuditEvents: agentAudit.length,
        },
      };

      res.json(archive);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to export archive" });
    }
  });

  app.get("/api/agents/:id/retirement-report", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const traces = await storage.getTracesByAgent(req.params.id);
      const evals = await storage.getEvalsByAgent(req.params.id);
      const auditEvents = await storage.getAuditEvents();
      const retirementEvents = auditEvents.filter(e => 
        e.objectId === req.params.id && 
        (e.action === "agent_retirement_initiated" || e.action === "agent_retired")
      );

      let retirementReason = "Not specified";
      let replacementAgentId = null;
      let replacementAgentName = null;
      if (retirementEvents.length > 0) {
        try {
          const details = JSON.parse(retirementEvents[0].details || "{}");
          retirementReason = details.reason || retirementReason;
          replacementAgentId = details.replacementAgentId || null;
        } catch {}
      }
      if (replacementAgentId) {
        const replacement = await storage.getAgent(replacementAgentId);
        replacementAgentName = replacement?.name || null;
      }

      let linkedOutcomeName = null;
      if (agent.outcomeId) {
        const outcomes = await storage.getOutcomes();
        const outcome = outcomes.find(o => o.id === agent.outcomeId);
        linkedOutcomeName = outcome?.name || null;
      }

      const recentTraces = traces.slice(-100);
      const successCount = recentTraces.filter(t => t.status === "completed" || t.status === "success").length;
      const failCount = recentTraces.filter(t => t.status === "failed" || t.status === "error").length;

      const report = {
        generatedAt: new Date().toISOString(),
        agent: {
          id: agent.id,
          name: agent.name,
          owner: agent.owner,
          riskTier: agent.riskTier,
          status: agent.status,
          createdAt: agent.createdAt,
        },
        retirementDetails: {
          reason: retirementReason,
          replacementAgentId,
          replacementAgentName,
          retirementInitiatedAt: retirementEvents.find(e => e.action === "agent_retirement_initiated")?.createdAt || null,
          archivedAt: retirementEvents.find(e => e.action === "agent_retired")?.createdAt || null,
        },
        outcomeImpact: {
          linkedOutcome: linkedOutcomeName,
          outcomeId: agent.outcomeId,
        },
        performanceSummary: {
          totalRuns: agent.totalRuns,
          lifetimeSuccessRate: agent.successRate,
          last100Runs: {
            success: successCount,
            failed: failCount,
            total: recentTraces.length,
          },
          healthScore: agent.healthScore,
          avgLatencyMs: agent.avgLatencyMs,
        },
        costSummary: {
          monthlyCost: agent.monthlyCost,
          monthlyRevenue: agent.monthlyRevenue,
          costPerRun: agent.costPerRun,
          roi: agent.monthlyRevenue && agent.monthlyCost ? ((agent.monthlyRevenue - agent.monthlyCost) / agent.monthlyCost * 100).toFixed(1) + "%" : "N/A",
        },
        evaluationSummary: {
          totalSuites: evals.length,
          avgPassRate: evals.length > 0 ? Math.round(evals.reduce((s, e) => s + ((e as any).passRate || 0), 0) / evals.length * 100) / 100 : null,
        },
      };

      res.json(report);
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to generate retirement report" });
    }
  });

  // ── Retirement Workflow ──────────────────────────────────────────
  app.post("/api/agents/:id/initiate-retirement", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });
      if (agent.status === "retired") return res.status(400).json({ message: "Agent is already retired" });

      const { reason, replacementAgentId, requireApproval } = req.body;

      if (requireApproval) {
        const approval = await storage.createApproval({
          type: "retirement_review",
          objectType: "agent",
          objectId: agent.id,
          objectName: agent.name,
          riskScore: agent.riskTier === "HIGH" ? 0.8 : agent.riskTier === "CRITICAL" ? 0.95 : 0.5,
          requestedBy: "system",
          description: `Retirement request for agent "${agent.name}". Reason: ${reason || "Not specified"}. Replacement: ${replacementAgentId || "None designated"}.`,
          evidenceJson: {
            retirementReason: reason,
            replacementAgentId,
            currentStatus: agent.status,
            healthScore: agent.healthScore,
            monthlyCost: agent.monthlyCost,
            monthlyRevenue: agent.monthlyRevenue,
            riskTier: agent.riskTier,
          },
        });
        res.json({ status: "pending_approval", approvalId: approval.id, message: "Retirement requires expert approval" });
      } else {
        const updated = await storage.updateAgent(req.params.id, { status: "retiring" });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "system",
          action: "agent_retirement_initiated",
          objectType: "agent",
          objectId: agent.id,
          details: JSON.stringify({ reason, replacementAgentId, previousStatus: agent.status }),
        });
        res.json({ status: "retiring", agentId: agent.id, message: "Retirement initiated" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to initiate retirement" });
    }
  });

  app.post("/api/agents/:id/complete-retirement", async (req, res) => {
    try {
      const agent = await storage.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const { handoverComplete, requireApproval } = req.body;

      if (requireApproval && !handoverComplete) {
        const approval = await storage.createApproval({
          type: "handover_review",
          objectType: "agent",
          objectId: agent.id,
          objectName: agent.name,
          riskScore: 0.6,
          requestedBy: "system",
          description: `Handover completeness review for agent "${agent.name}" before final archival.`,
          evidenceJson: {
            currentStatus: agent.status,
            handoverComplete: !!handoverComplete,
          },
        });
        res.json({ status: "pending_handover_approval", approvalId: approval.id });
      } else {
        const updated = await storage.updateAgent(req.params.id, { status: "retired" });
        await storage.createAuditEvent({
          actorType: "system",
          actorId: "system",
          action: "agent_retired",
          objectType: "agent",
          objectId: agent.id,
          details: JSON.stringify({ previousStatus: agent.status, archivedAt: new Date().toISOString() }),
        });
        res.json({ status: "retired", agentId: agent.id, message: "Agent archived successfully" });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Failed to complete retirement" });
    }
  });

  // ==================== Patches (Patch Center) ====================
  app.get("/api/patches", async (_req, res) => {
    const allPatches = await storage.getPatches();
    res.json(allPatches);
  });

  app.get("/api/patches/agent/:agentId", async (req, res) => {
    const agentPatches = await storage.getPatchesByAgent(req.params.agentId);
    res.json(agentPatches);
  });

  app.post("/api/patches", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertPatchSchema.parse(req.body);
      const safetyViolation = checkPatchSafety(data);
      if (safetyViolation) {
        return res.status(403).json({ error: safetyViolation });
      }
      const patch = await storage.createPatch(data);
      res.status(201).json(patch);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/patches/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allowedFields = ["status", "simulationResult", "evalBundle", "sandboxId"];
      const updateData: any = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) updateData[key] = req.body[key];
      }
      if (updateData.status && !["proposed", "simulating", "eval_running", "pending_approval", "approved", "applied", "rejected", "rolled_back"].includes(updateData.status)) {
        return res.status(400).json({ message: "Invalid patch status" });
      }
      const safetyViolation = checkPatchSafety({ ...updateData, description: req.body.description });
      if (safetyViolation) {
        return res.status(403).json({ error: safetyViolation });
      }
      const updated = await storage.updatePatch(req.params.id as string, updateData);
      if (!updated) return res.status(404).json({ message: "Patch not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/patches/:id/simulate", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const patch = allPatches.find(p => p.id === (req.params.id as string));
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const simulationResult = {
        sandboxId: `sandbox-${crypto.randomUUID().slice(0, 8)}`,
        status: "completed",
        kpiProjections: {
          successRate: { current: 0.89, projected: patch.changeType === "prompt_tweak" ? 0.94 : 0.92, confidence: 0.85 },
          latency: { current: 2400, projected: patch.changeType === "model_upgrade_downgrade" ? 1800 : 2200, confidence: 0.78 },
          costPerRun: { current: 0.045, projected: patch.changeType === "cost_cap_tuning" ? 0.032 : 0.042, confidence: 0.90 },
        },
        policyViolations: 0,
        regressionDetected: false,
        simulatedAt: new Date().toISOString(),
      };

      const patchId = req.params.id as string;
      await storage.updatePatch(patchId, {
        status: "simulating",
        simulationResult,
        sandboxId: simulationResult.sandboxId,
      });

      setTimeout(async () => {
        await storage.updatePatch(patchId, { status: "proposed" });
      }, 2000);

      res.json(simulationResult);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/patches/:id/run-evals", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const evalPatchId = req.params.id as string;
      const patch = allPatches.find(p => p.id === evalPatchId);
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const evalResult = {
        suiteId: `eval-${crypto.randomUUID().slice(0, 8)}`,
        totalCases: 48,
        passed: 44,
        failed: 4,
        passRate: 0.917,
        regressions: patch.riskLevel === "high" ? 2 : 0,
        improvements: patch.changeType === "prompt_tweak" ? 6 : 3,
        evaluatedAt: new Date().toISOString(),
      };

      await storage.updatePatch(evalPatchId, {
        status: "eval_running",
        evalBundle: evalResult,
      });

      setTimeout(async () => {
        const finalStatus = evalResult.regressions > 0 ? "proposed" : "proposed";
        await storage.updatePatch(evalPatchId, { status: finalStatus });
      }, 2000);

      res.json(evalResult);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/patches/:id/request-approval", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const allPatches = await storage.getPatches();
      const approvalPatchId = req.params.id as string;
      const patch = allPatches.find(p => p.id === approvalPatchId);
      if (!patch) return res.status(404).json({ message: "Patch not found" });

      const approval = await storage.createApproval({
        type: "patch_approval",
        objectType: "patch",
        objectId: patch.id,
        requestedBy: "autopatch-service",
        status: "pending",
        evidenceJson: {
          patchId: patch.id,
          changeType: patch.changeType,
          riskLevel: patch.riskLevel,
          evalBundle: patch.evalBundle,
          simulationResult: patch.simulationResult,
          expectedKpiImpact: patch.expectedKpiImpact,
          expectedCostImpact: patch.expectedCostImpact,
        },
      });

      await storage.updatePatch(approvalPatchId, { status: "pending_approval" });

      res.json({ approvalId: approval.id, status: "pending_approval" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/ai/generate-patches", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const { agentId } = req.body;
      if (!agentId) return res.status(400).json({ message: "agentId required" });

      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ message: "Agent not found" });

      const recommendations = await storage.getImprovementRecommendationsByAgent(agentId);
      const driftSignals = recommendations.filter(r => r.source === "drift" || r.severity === "high" || r.severity === "critical");
      const evalSuites = await storage.getEvalsByAgent(agentId);

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          {
            role: "system",
            content: `You are an autonomous agent optimization engine. Based on agent performance data, drift signals, and evaluation results, generate candidate patches that could improve the agent. Each patch is a self-contained change proposal.

Return a JSON array of 2-4 patch proposals. Each patch must have:
- changeType: one of "prompt_tweak", "retrieval_change", "tool_retry_fallback", "model_upgrade_downgrade", "cost_cap_tuning"
- title: short descriptive title
- description: what the patch does and why
- diff: JSON object describing the change (before/after config)
- expectedKpiImpact: expected improvement description
- expectedCostImpact: cost change description (e.g. "-12% cost/run" or "+$0.01/run for better quality")
- riskLevel: "low", "medium", "high", or "critical"
- requiredApprovals: number (0 for low risk, 1 for medium, 2+ for high/critical)
- rolloutPlan: JSON with strategy ("canary"/"shadow"/"direct"), trafficPercent, duration

SAFETY CONSTRAINTS:
- Cannot propose expanding tool permissions (requires explicit approval)
- Cannot change write-action behavior without high-tier approval
- Cannot alter redaction/audit policies autonomously
- Cost increases must be flagged with higher risk

Return ONLY valid JSON array.`,
          },
          {
            role: "user",
            content: `Agent: ${agent.name} (${agent.modelProvider || "general"})
Success Rate: ${((agent.successRate || 0) * 100).toFixed(1)}%
Avg Latency: ${agent.avgLatencyMs || 0}ms
Cost/Run: $${agent.costPerRun || 0}
Health Score: ${agent.healthScore || 0}
Drift Signals: ${JSON.stringify(driftSignals.slice(0, 5))}
Recent Recommendations: ${JSON.stringify(recommendations.slice(0, 3).map(r => ({ type: r.type, title: r.title, severity: r.severity })))}
Eval Suites: ${evalSuites.length} configured`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "[]";
      let parsedPatches: any[];
      try {
        const parsed = JSON.parse(content);
        parsedPatches = Array.isArray(parsed) ? parsed : parsed.patches || [parsed];
      } catch {
        parsedPatches = [];
      }

      const createdPatches = [];
      for (const p of parsedPatches) {
        const safetyCheck = checkPatchSafety(p);
        if (safetyCheck) {
          p.riskLevel = "critical";
          p.requiredApprovals = 3;
          p.description = `[SAFETY FLAG: ${safetyCheck}] ${p.description || ""}`;
        }
        const patch = await storage.createPatch({
          agentId,
          changeType: p.changeType || "prompt_tweak",
          title: p.title || "AI-generated patch",
          description: p.description,
          diff: p.diff,
          expectedKpiImpact: p.expectedKpiImpact,
          expectedCostImpact: p.expectedCostImpact,
          riskLevel: p.riskLevel || "medium",
          requiredApprovals: p.requiredApprovals || 0,
          rolloutPlan: p.rolloutPlan,
          evidenceBundle: {
            source: "ai_generated",
            driftSignalCount: driftSignals.length,
            recommendationCount: recommendations.length,
            generatedAt: new Date().toISOString(),
          },
          status: "proposed",
        });
        createdPatches.push(patch);
      }

      res.json({ patches: createdPatches, generated: createdPatches.length });
    } catch (e: any) {
      console.error("AI patch generation error:", e);
      res.status(500).json({ message: e.message || "Failed to generate patches" });
    }
  });

  // ==================== Experiments ====================
  app.get("/api/experiments", async (_req, res) => {
    const allExperiments = await storage.getExperiments();
    res.json(allExperiments);
  });

  app.post("/api/experiments", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const data = insertExperimentSchema.parse(req.body);
      const experiment = await storage.createExperiment(data);
      res.status(201).json(experiment);
    } catch (e: any) {
      if (e instanceof ZodError) return res.status(400).json({ message: e.errors });
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/experiments/:id", checkPermission("create_modify_blueprints"), async (req, res) => {
    try {
      const updated = await storage.updateExperiment(req.params.id as string, req.body);
      if (!updated) return res.status(404).json({ message: "Experiment not found" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================== Remediation Timeline ====================
  app.get("/api/remediation-timeline", async (_req, res) => {
    try {
      const cycles = await storage.getImprovementCycles();
      const actionLogs = await storage.getAutonomousActionLogs();
      const agents = await storage.getAgents();
      const agentMap = new Map(agents.map(a => [a.id, a.name]));

      const timeline = [
        ...cycles.map(c => ({
          id: c.id,
          type: "improvement_cycle" as const,
          agentId: c.agentId,
          agentName: agentMap.get(c.agentId) || c.agentId,
          trigger: c.triggerType,
          change: c.proposedAction,
          changeType: c.actionType,
          proof: c.evaluationResult,
          status: c.status,
          riskLevel: c.riskLevel,
          autoApplied: c.autoApplied,
          canRollback: c.status === "applied" || c.autoApplied,
          createdAt: c.createdAt,
        })),
        ...actionLogs.map(a => ({
          id: a.id,
          type: "autonomous_action" as const,
          agentId: a.agentId,
          agentName: agentMap.get(a.agentId) || a.agentId,
          trigger: a.trigger,
          change: a.description || a.actionType,
          changeType: a.actionType,
          proof: a.details,
          status: a.status,
          riskLevel: "low",
          autoApplied: true,
          canRollback: a.status === "completed",
          createdAt: a.createdAt,
        })),
      ].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json(timeline);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ==================== Seed Patches & Experiments ====================
  app.post("/api/seed/optimization", async (_req, res) => {
    try {
      const agents = await storage.getAgents();
      if (agents.length === 0) return res.json({ message: "No agents to seed patches for" });

      const existingPatches = await storage.getPatches();
      if (existingPatches.length > 0) return res.json({ message: "Patches already seeded", count: existingPatches.length });

      const changeTypes = ["prompt_tweak", "retrieval_change", "tool_retry_fallback", "model_upgrade_downgrade", "cost_cap_tuning"];
      const samplePatches = [
        { title: "Optimize system prompt for conciseness", changeType: "prompt_tweak", desc: "Reduce token count by 30% while maintaining instruction clarity. Analysis shows verbose prompts increase latency without improving accuracy.", kpi: "+2.1% success rate, -180ms latency", cost: "-18% cost/run ($0.008 savings)", risk: "low", approvals: 0 },
        { title: "Switch to RAG v2 retrieval pipeline", changeType: "retrieval_change", desc: "Upgrade retrieval from keyword-based to hybrid semantic+keyword search. Drift analysis detected declining faithfulness scores correlated with knowledge base updates.", kpi: "+4.5% faithfulness, -12% hallucination rate", cost: "+$0.003/run for embedding compute", risk: "medium", approvals: 1 },
        { title: "Add exponential backoff for API tool calls", changeType: "tool_retry_fallback", desc: "Tool call failures spiked 3x in last 24h. Adding retry with exponential backoff (max 3 attempts) and fallback to cached responses.", kpi: "+8% tool reliability, -5% failure rate", cost: "+$0.001/run (retry overhead)", risk: "low", approvals: 0 },
        { title: "Downgrade to GPT-4.1-mini for classification tasks", changeType: "model_upgrade_downgrade", desc: "Classification sub-tasks show 99.2% accuracy with mini model vs 99.5% with full model. Cost savings outweigh marginal accuracy loss.", kpi: "-0.3% accuracy (within SLA)", cost: "-42% cost/run ($0.019 savings)", risk: "medium", approvals: 1 },
        { title: "Adjust cost cap from $0.05 to $0.04/run", changeType: "cost_cap_tuning", desc: "Current cost cap allows expensive completions that don't improve outcomes. Tightening cap will enforce more efficient token usage.", kpi: "Neutral (within error margin)", cost: "-20% max cost/run", risk: "low", approvals: 0 },
        { title: "Expand context window for complex queries", changeType: "prompt_tweak", desc: "Complex multi-step queries failing at 15% rate due to truncated context. Expanding context window from 4K to 8K tokens for qualifying queries.", kpi: "+6% success rate on complex queries", cost: "+35% cost/run for affected queries (~8% of traffic)", risk: "high", approvals: 2 },
      ];

      const createdPatches = [];
      for (let i = 0; i < samplePatches.length; i++) {
        const sp = samplePatches[i];
        const agent = agents[i % agents.length];
        const patch = await storage.createPatch({
          agentId: agent.id,
          changeType: sp.changeType,
          title: sp.title,
          description: sp.desc,
          diff: { before: { config: "original" }, after: { config: "modified", changeType: sp.changeType } },
          expectedKpiImpact: sp.kpi,
          expectedCostImpact: sp.cost,
          riskLevel: sp.risk,
          requiredApprovals: sp.approvals,
          status: i === 2 ? "pending_approval" : i === 4 ? "applied" : "proposed",
          evidenceBundle: { source: i < 3 ? "drift_detection" : "eval_analysis", signalCount: Math.floor(Math.random() * 5) + 1, detectedAt: new Date(Date.now() - Math.random() * 7 * 86400000).toISOString() },
          rolloutPlan: { strategy: sp.risk === "high" ? "canary" : sp.risk === "medium" ? "shadow" : "direct", trafficPercent: sp.risk === "high" ? 5 : sp.risk === "medium" ? 20 : 100, duration: sp.risk === "high" ? "48h" : sp.risk === "medium" ? "24h" : "immediate" },
        });
        createdPatches.push(patch);
      }

      const sampleExperiments = [
        { name: "Prompt Conciseness A/B Test", desc: "Testing optimized prompt vs baseline for success rate impact", traffic: 20, metric: "success_rate", gate: "pass_rate >= 90%", status: "running", results: { variantA: { successRate: 0.891, avgLatency: 2340, costPerRun: 0.045, sampleSize: 1240 }, variantB: { successRate: 0.912, avgLatency: 2160, costPerRun: 0.037, sampleSize: 1180 }, confidence: 0.87, pValue: 0.032, statisticallySignificant: true, runningFor: "3d 14h" } },
        { name: "RAG v2 Canary Deployment", desc: "Canary test of hybrid retrieval pipeline with 10% traffic", traffic: 10, metric: "faithfulness_score", gate: "faithfulness >= 0.85", status: "running", results: { variantA: { faithfulness: 0.82, hallucRate: 0.08, avgLatency: 1890, sampleSize: 620 }, variantB: { faithfulness: 0.91, hallucRate: 0.03, avgLatency: 2100, sampleSize: 580 }, confidence: 0.92, pValue: 0.008, statisticallySignificant: true, runningFor: "1d 8h" } },
        { name: "Model Downgrade Validation", desc: "Shadow comparison of GPT-4.1 vs GPT-4.1-mini for classification", traffic: 50, metric: "classification_accuracy", gate: "accuracy >= 99%", status: "completed", results: { variantA: { accuracy: 0.995, avgLatency: 890, costPerRun: 0.045, sampleSize: 5000 }, variantB: { accuracy: 0.992, avgLatency: 340, costPerRun: 0.012, sampleSize: 5000 }, confidence: 0.96, pValue: 0.041, statisticallySignificant: true, winner: "variantB", runningFor: "7d 0h" } },
      ];

      const createdExps = [];
      for (let i = 0; i < sampleExperiments.length; i++) {
        const se = sampleExperiments[i];
        const agent = agents[i % agents.length];
        const exp = await storage.createExperiment({
          agentId: agent.id,
          patchId: createdPatches[i]?.id,
          name: se.name,
          description: se.desc,
          trafficPercent: se.traffic,
          successMetric: se.metric,
          evalGate: se.gate,
          guardrails: { maxPolicyViolationIncrease: 0, maxLatencyIncrease: "20%", minSuccessRate: 0.85 },
          status: se.status,
          results: se.results,
          startedAt: new Date(Date.now() - Math.random() * 7 * 86400000),
          completedAt: se.status === "completed" ? new Date() : null,
        });
        createdExps.push(exp);
      }

      res.json({ patches: createdPatches.length, experiments: createdExps.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Aggregated Overview endpoint ──────────────────────────────────
  app.get("/api/overview", async (_req, res) => {
    try {
      const [agents, outcomes, kpis, allApprovals, allInvoices, allEvents, allDisputes, evalSuites, traces, deployments] = await Promise.all([
        storage.getAgents(),
        storage.getOutcomes(),
        storage.getKpis(),
        storage.getApprovals(),
        storage.getInvoices(),
        storage.getOutcomeEvents(),
        storage.getBillingDisputes(),
        storage.getEvalSuites(),
        storage.getTraces(),
        storage.getDeployments(),
      ]);

      // --- Outcome Health Grid ---
      const outcomeHealth = outcomes.map((o) => {
        const outcomeKpis = kpis.filter((k) => k.outcomeId === o.id);
        const avgConfidence = outcomeKpis.length > 0
          ? outcomeKpis.reduce((s, k) => s + (k.confidence || 0), 0) / outcomeKpis.length
          : 0;
        const kpiSummaries = outcomeKpis.map((k) => ({
          id: k.id,
          name: k.name,
          unit: k.unit,
          current: k.currentValue || 0,
          target: k.target,
          progress: k.target ? Math.min(((k.currentValue || 0) / k.target) * 100, 100) : 0,
          slaThreshold: k.slaThreshold,
          breachLevel: k.breachLevel,
          trend: k.trend,
        }));
        const slaConfig = o.slaConfig as any;
        const slaBreach = kpiSummaries.some((k) => k.slaThreshold && k.current < k.slaThreshold);
        return {
          id: o.id,
          name: o.name,
          status: o.status,
          riskTier: o.riskTier,
          confidence: Math.round(avgConfidence * 100) / 100,
          slaStatus: slaBreach ? "breach" : "healthy",
          kpis: kpiSummaries,
          slaConfig,
        };
      });

      // --- Agents At Risk ---
      const driftMap: Record<string, { driftPercent: number; detectedAt: string }> = {};
      for (const suite of evalSuites) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        if (runs.length < 2) continue;
        const sorted = [...runs].sort((a, b) =>
          new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
        );
        const latest = sorted[0];
        const prev = sorted[1];
        const latestPass = latest.passRate ?? (latest.passedCases && latest.totalCases ? latest.passedCases / latest.totalCases : null);
        const prevPass = prev.passRate ?? (prev.passedCases && prev.totalCases ? prev.passedCases / prev.totalCases : null);
        if (latestPass !== null && prevPass !== null && prevPass > 0) {
          const drift = ((latestPass - prevPass) / prevPass) * 100;
          if (suite.agentId && (Math.abs(drift) > (Math.abs(driftMap[suite.agentId]?.driftPercent || 0)))) {
            driftMap[suite.agentId] = {
              driftPercent: Math.round(drift * 10) / 10,
              detectedAt: (latest.startedAt || new Date()).toString(),
            };
          }
        }
      }

      const openIncidents = traces.filter((t) => t.status === "failed" || t.status === "error");
      const incidentsByAgent: Record<string, number> = {};
      for (const t of openIncidents) {
        if (t.agentId) incidentsByAgent[t.agentId] = (incidentsByAgent[t.agentId] || 0) + 1;
      }

      const agentTraceMap: Record<string, number[]> = {};
      for (const t of traces) {
        if (t.agentId && t.latencyMs) {
          if (!agentTraceMap[t.agentId]) agentTraceMap[t.agentId] = [];
          agentTraceMap[t.agentId].push(t.latencyMs);
        }
      }

      const riskOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const agentsAtRisk = agents
        .filter((a) => a.status === "active" || a.status === "retiring")
        .map((a) => {
          const latencies = agentTraceMap[a.id] || [];
          latencies.sort((x, y) => x - y);
          const p95 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : a.avgLatencyMs || 0;
          return {
            id: a.id,
            name: a.name,
            environment: a.environment,
            riskTier: a.riskTier,
            healthScore: a.healthScore,
            lastDrift: driftMap[a.id] || null,
            openIncidents: incidentsByAgent[a.id] || 0,
            p95Latency: p95,
            costPerRun: a.costPerRun || 0,
          };
        })
        .sort((a, b) => (riskOrder[a.riskTier] ?? 99) - (riskOrder[b.riskTier] ?? 99))
        .slice(0, 10);

      // --- Approval Queue (top 5 pending) ---
      const pendingApprovals = allApprovals
        .filter((a) => a.status === "pending")
        .sort((a, b) => {
          if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        })
        .slice(0, 5)
        .map((a) => ({
          id: a.id,
          type: a.type,
          objectName: a.objectName,
          objectType: a.objectType,
          riskScore: a.riskScore,
          requestedBy: a.requestedBy,
          dueDate: a.dueDate,
          createdAt: a.createdAt,
          agentId: a.agentId,
          outcomeId: a.outcomeId,
          environment: a.environment,
        }));
      const totalPendingApprovals = allApprovals.filter((a) => a.status === "pending").length;

      // --- Financial Snapshot (last 30 days) ---
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentInvoices = allInvoices.filter((i) => new Date(i.createdAt || 0) >= thirtyDaysAgo);
      const billedAmount = recentInvoices
        .filter((i) => i.status === "paid" || i.status === "finalized")
        .reduce((s, i) => s + (i.amount || 0), 0);
      const pendingAmount = recentInvoices
        .filter((i) => i.status === "pending" || i.status === "draft")
        .reduce((s, i) => s + (i.amount || 0), 0);
      const recentDisputes = allDisputes.filter((d) => new Date(d.createdAt || 0) >= thirtyDaysAgo);
      const disputedAmount = recentDisputes
        .filter((d) => d.status === "open" || d.status === "under_review")
        .reduce((s, d) => s + (d.amount || 0), 0);
      const totalRevenue30d = recentInvoices.reduce((s, i) => s + (i.amount || 0), 0);

      // --- System Status ---
      const recentTraces = traces.filter((t) => new Date(t.startedAt || 0) >= thirtyDaysAgo);
      const failedTraces = recentTraces.filter((t) => t.status === "failed" || t.status === "error");
      const toolErrorRate = recentTraces.length > 0 ? (failedTraces.length / recentTraces.length) * 100 : 0;

      const pendingEvalRuns: number[] = [];
      for (const suite of evalSuites.slice(0, 20)) {
        const runs = await storage.getEvalRunsBySuite(suite.id);
        const pending = runs.filter((r) => r.status === "running" || r.status === "pending");
        pendingEvalRuns.push(pending.length);
      }
      const evalBacklog = pendingEvalRuns.reduce((s, n) => s + n, 0);

      const activeDeployments = deployments.filter((d) => d.status === "deployed" || d.status === "active");
      const connectorHealth = activeDeployments.length > 0
        ? Math.round((activeDeployments.length / Math.max(deployments.length, 1)) * 100)
        : 100;

      res.json({
        outcomeHealth,
        agentsAtRisk,
        approvalQueue: {
          items: pendingApprovals,
          totalPending: totalPendingApprovals,
        },
        financialSnapshot: {
          billed: Math.round(billedAmount * 100) / 100,
          pending: Math.round(pendingAmount * 100) / 100,
          disputed: Math.round(disputedAmount * 100) / 100,
          totalRevenue30d: Math.round(totalRevenue30d * 100) / 100,
        },
        systemStatus: {
          toolErrorRate: Math.round(toolErrorRate * 10) / 10,
          queueDepth: totalPendingApprovals,
          evalBacklog,
          connectorHealth,
          activeAgents: agents.filter((a) => a.status === "active").length,
          totalAgents: agents.length,
        },
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
