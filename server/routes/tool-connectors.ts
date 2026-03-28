import { Router } from "express";
import { storage } from "../storage";
import { z, ZodError } from "zod";
import { insertToolConnectorSchema } from "@shared/schema";
import { getOrgId } from "../auth";
import { jobEvents } from "../worker";
import { handleZodError } from "./helpers";

const router = Router();

  // Tool Connectors
  router.get("/api/tool-connectors", async (_req, res) => {
    const connectors = await storage.getToolConnectors();
    res.json(connectors);
  });

  router.get("/api/tool-connectors/:id", async (req, res) => {
    const connector = await storage.getToolConnector(req.params.id);
    if (!connector) return res.status(404).json({ message: "Connector not found" });
    res.json(connector);
  });

  router.post("/api/tool-connectors", async (req, res) => {
    try {
      const data = insertToolConnectorSchema.parse(req.body);
      const connector = await storage.createToolConnector(data);
      res.status(201).json(connector);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  router.patch("/api/tool-connectors/:id", async (req, res) => {
    const updated = await storage.updateToolConnector(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Connector not found" });
    res.json(updated);
  });

  router.post("/api/tool-connectors/:id/test", async (req, res) => {
    const connector = await storage.getToolConnector(req.params.id);
    if (!connector) return res.status(404).json({ message: "Connector not found" });

    const startTime = Date.now();
    let success = false;
    let message = "";
    let statusCode = 0;

    try {
      const testUrl = (connector as any).endpoint || (connector as any).url || (connector as any).baseUrl;
      if (!testUrl) {
        message = "No endpoint URL configured for this connector";
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(testUrl, {
            method: "GET",
            signal: controller.signal,
            headers: { "User-Agent": "NousOrchestrator/1.0 ConnectorTest" },
          });
          clearTimeout(timeout);
          statusCode = response.status;
          success = response.ok || response.status < 500;
          message = success
            ? `Connection successful (HTTP ${statusCode})`
            : `Server returned error (HTTP ${statusCode})`;
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === "AbortError") {
            message = "Connection timed out after 10 seconds — check endpoint URL and network";
          } else if (fetchErr.code === "ENOTFOUND") {
            message = `DNS resolution failed — host not found: ${testUrl}`;
          } else if (fetchErr.code === "ECONNREFUSED") {
            message = `Connection refused — server at ${testUrl} is not accepting connections`;
          } else {
            message = `Connection failed: ${fetchErr.message}`;
          }
        }
      }
    } catch (err: any) {
      message = `Test error: ${err.message}`;
    }

    const latency = Date.now() - startTime;
    const result = success ? "success" : "failure";

    await storage.updateToolConnector(req.params.id, {
      lastTestedAt: new Date(),
      lastTestResult: result,
      status: success ? "connected" : "error",
    });

    res.json({
      success,
      latencyMs: latency,
      statusCode: statusCode || undefined,
      message,
      testedAt: new Date().toISOString(),
    });
  });

router.delete("/api/tool-connectors/:id", async (req, res) => {
    await storage.deleteToolConnector(req.params.id);
    res.json({ success: true });
  });

  router.get("/api/alerts/critical-violations", async (req, res) => {
    try {
      const traces = await storage.getTraces(getOrgId(req));
      const agents = await storage.getAgents(getOrgId(req));
      const agentMap = new Map(agents.map(a => [a.id, a]));
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const violations: Array<{
        id: string;
        agentId: string;
        agentName: string;
        policyName: string;
        rule: string;
        severity: string;
        traceId: string;
        timestamp: string;
        action: string;
      }> = [];

      for (const trace of traces) {
        if (trace.status !== "blocked") continue;
        const traceTime = trace.startedAt ? new Date(trace.startedAt) : null;
        if (!traceTime || traceTime < oneHourAgo) continue;

        const policyChecks = trace.policyChecks;
        if (!policyChecks || !Array.isArray(policyChecks)) continue;

        for (const check of policyChecks as Array<any>) {
          if (check.severity === "critical") {
            const agent = agentMap.get(trace.agentId);
            violations.push({
              id: `${trace.id}-${check.policyName || check.policy || "unknown"}`,
              agentId: trace.agentId,
              agentName: agent?.name || "Unknown Agent",
              policyName: check.policyName || check.policy || "Unknown Policy",
              rule: check.rule || check.description || "Policy violation",
              severity: "critical",
              traceId: trace.id,
              timestamp: traceTime.toISOString(),
              action: check.action || "blocked",
            });
          }
        }
      }

      res.json(violations);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  const INDUSTRY_POLICY_REQUIREMENTS: Record<string, Array<{ domain: string; regulation: string; description: string }>> = {
    financial_services: [
      { domain: "data_handling", regulation: "PCI-DSS", description: "Payment Card Industry Data Security Standard data handling policy" },
      { domain: "data_handling", regulation: "GLBA", description: "Gramm-Leach-Bliley Act customer data privacy policy" },
      { domain: "data_handling", regulation: "BSA/AML", description: "Bank Secrecy Act / Anti-Money Laundering data retention policy" },
      { domain: "tool_permissions", regulation: "SOX", description: "Sarbanes-Oxley financial reporting controls" },
      { domain: "output_control", regulation: "REG_DD", description: "Truth in Savings disclosure output controls" },
    ],
    healthcare: [
      { domain: "data_handling", regulation: "HIPAA", description: "Health Insurance Portability and Accountability Act PHI handling policy" },
      { domain: "data_handling", regulation: "HITECH", description: "HITECH Act breach notification and data protection policy" },
      { domain: "output_control", regulation: "HIPAA", description: "HIPAA minimum necessary standard output filtering" },
    ],
    insurance: [
      { domain: "data_handling", regulation: "NAIC", description: "NAIC model regulation data governance policy" },
      { domain: "data_handling", regulation: "GDPR", description: "GDPR policyholder data processing policy" },
      { domain: "output_control", regulation: "NAIC", description: "NAIC consumer communication compliance controls" },
    ],
    manufacturing: [
      { domain: "tool_permissions", regulation: "OSHA", description: "OSHA safety interlock tool access controls" },
      { domain: "data_handling", regulation: "ITAR", description: "ITAR export-controlled data handling policy" },
    ],
    retail: [
      { domain: "data_handling", regulation: "PCI-DSS", description: "PCI-DSS payment card data handling policy" },
      { domain: "data_handling", regulation: "CCPA", description: "CCPA consumer data privacy policy" },
    ],
    technology_saas: [
      { domain: "data_handling", regulation: "SOC2", description: "SOC 2 Type II data handling and security controls" },
      { domain: "data_handling", regulation: "GDPR", description: "GDPR data processing and residency policy" },
      { domain: "output_control", regulation: "CCPA", description: "CCPA consumer data output controls" },
    ],
  };

  router.post("/api/governance/design-time-check", async (req, res) => {
    try {
      const schema = z.object({
        industryId: z.string(),
        riskTier: z.string().optional(),
      });
      const { industryId, riskTier } = schema.parse(req.body);

      const requirements = INDUSTRY_POLICY_REQUIREMENTS[industryId];
      if (!requirements || requirements.length === 0) {
        return res.json({ passed: true, requirements: [] });
      }

      const activePolicies = await storage.getPolicies(getOrgId(req));
      const active = activePolicies.filter(p => p.status === "active");

      const results = requirements.map(req => {
        const isHighRisk = riskTier === "HIGH" || riskTier === "CRITICAL";
        const matchingPolicy = active.find(p => {
          const domainMatch = p.domain === req.domain;
          if (!domainMatch) return false;
          const regulationLower = req.regulation.toLowerCase().split("/")[0];
          const nameOrDescMatch =
            (p.name || "").toLowerCase().includes(regulationLower) ||
            (p.description || "").toLowerCase().includes(regulationLower);
          return nameOrDescMatch;
        });

        return {
          domain: req.domain,
          regulation: req.regulation,
          description: req.description,
          status: matchingPolicy ? "satisfied" as const : "missing" as const,
          matchingPolicy: matchingPolicy?.name,
          severity: isHighRisk ? "critical" : "warning",
        };
      });

      const passed = results.every(r => r.status === "satisfied");

      res.json({ passed, requirements: results });
    } catch (e: any) {
      if (e instanceof ZodError) {
        return res.status(400).json({ message: "Validation error", errors: e.errors });
      }
      res.status(500).json({ message: e.message });
    }
  });

  router.post("/api/governance/what-if", async (req, res) => {
    try {
      const whatIfSchema = z.object({
        policyDomain: z.string(),
        thresholdField: z.string(),
        currentValue: z.number(),
        proposedValue: z.number(),
      });
      const { policyDomain, thresholdField, currentValue, proposedValue } = whatIfSchema.parse(req.body);

      const traces = await storage.getTraces(getOrgId(req));
      const agents = await storage.getAgents(getOrgId(req));
      const agentMap = new Map(agents.map(a => [a.id, a]));

      const affectedAgentIds = new Set<string>();
      let tracesBlockedCount = 0;
      let totalTracesAnalyzed = 0;

      for (const trace of traces) {
        const toolCalls = trace.toolCalls as Array<any> | null;
        const policyChecks = trace.policyChecks as Array<any> | null;

        let matchesDomain = false;

        if (toolCalls && Array.isArray(toolCalls)) {
          for (const tc of toolCalls) {
            if (tc.domain === policyDomain || tc.category === policyDomain || tc.type === policyDomain) {
              matchesDomain = true;
              break;
            }
          }
        }

        if (!matchesDomain && policyChecks && Array.isArray(policyChecks)) {
          for (const pc of policyChecks) {
            if (pc.domain === policyDomain || pc.policyDomain === policyDomain || pc.category === policyDomain) {
              matchesDomain = true;
              break;
            }
          }
        }

        if (matchesDomain) {
          totalTracesAnalyzed++;
          affectedAgentIds.add(trace.agentId);

          const wouldBeBlocked = proposedValue < currentValue;
          if (wouldBeBlocked && trace.status !== "blocked") {
            const blockProbability = Math.abs(proposedValue - currentValue) / Math.max(currentValue, 1);
            if (blockProbability > 0.5) {
              tracesBlockedCount++;
            }
          }
        }
      }

      const affectedAgents = Array.from(affectedAgentIds).map(id => {
        const agent = agentMap.get(id);
        return {
          id,
          name: agent?.name || "Unknown Agent",
          currentStatus: agent?.status || "unknown",
        };
      });

      const estimatedCostImpact = tracesBlockedCount * (agents.length > 0
        ? agents.reduce((sum, a) => sum + (a.costPerRun || 0), 0) / agents.length
        : 0.05);

      let riskAssessment = "low";
      if (tracesBlockedCount > totalTracesAnalyzed * 0.3) {
        riskAssessment = "high";
      } else if (tracesBlockedCount > totalTracesAnalyzed * 0.1) {
        riskAssessment = "medium";
      }

      res.json({
        affectedAgents,
        tracesBlockedCount,
        totalTracesAnalyzed,
        estimatedCostImpact: Math.round(estimatedCostImpact * 100) / 100,
        riskAssessment,
      });
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/audit-events/filtered", async (req, res) => {
    try {
      const { actorType, action, objectType, search, startDate, endDate } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      let events = await storage.getAuditEvents(getOrgId(req));

      if (actorType) {
        events = events.filter(e => e.actorType === actorType);
      }
      if (action) {
        events = events.filter(e => e.action === action);
      }
      if (objectType) {
        events = events.filter(e => e.objectType === objectType);
      }
      if (search) {
        const searchStr = (search as string).toLowerCase();
        events = events.filter(e =>
          (e.action && e.action.toLowerCase().includes(searchStr)) ||
          (e.details && e.details.toLowerCase().includes(searchStr)) ||
          (e.objectId && e.objectId.toLowerCase().includes(searchStr)) ||
          (e.actorId && e.actorId.toLowerCase().includes(searchStr))
        );
      }
      if (startDate) {
        const start = new Date(startDate as string);
        if (!isNaN(start.getTime())) {
          events = events.filter(e => e.createdAt && new Date(e.createdAt) >= start);
        }
      }
      if (endDate) {
        const end = new Date(endDate as string);
        if (!isNaN(end.getTime())) {
          events = events.filter(e => e.createdAt && new Date(e.createdAt) <= end);
        }
      }

      const total = events.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedEvents = events.slice(offset, offset + limit);

      res.json({ events: paginatedEvents, total, page, totalPages });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.get("/api/audit-events/export", async (req, res) => {
    try {
      const { actorType, action, objectType, search, startDate, endDate } = req.query;

      let events = await storage.getAuditEvents(getOrgId(req));

      if (actorType) {
        events = events.filter(e => e.actorType === actorType);
      }
      if (action) {
        events = events.filter(e => e.action === action);
      }
      if (objectType) {
        events = events.filter(e => e.objectType === objectType);
      }
      if (search) {
        const searchStr = (search as string).toLowerCase();
        events = events.filter(e =>
          (e.action && e.action.toLowerCase().includes(searchStr)) ||
          (e.details && e.details.toLowerCase().includes(searchStr)) ||
          (e.objectId && e.objectId.toLowerCase().includes(searchStr)) ||
          (e.actorId && e.actorId.toLowerCase().includes(searchStr))
        );
      }
      if (startDate) {
        const start = new Date(startDate as string);
        if (!isNaN(start.getTime())) {
          events = events.filter(e => e.createdAt && new Date(e.createdAt) >= start);
        }
      }
      if (endDate) {
        const end = new Date(endDate as string);
        if (!isNaN(end.getTime())) {
          events = events.filter(e => e.createdAt && new Date(e.createdAt) <= end);
        }
      }

      const csvHeader = "id,actorType,actorId,action,objectType,objectId,details,sequenceNum,createdAt";
      const csvRows = events.map(e => {
        const details = (e.details || "").replace(/"/g, '""');
        return `${e.id},${e.actorType},${e.actorId || ""},${e.action},${e.objectType},${e.objectId || ""},"${details}",${e.sequenceNum || ""},${e.createdAt ? new Date(e.createdAt).toISOString() : ""}`;
      });
      const csv = [csvHeader, ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-events.csv");
      res.send(csv);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  router.get("/api/admin/org-settings", async (_req, res) => {
    const settings = await storage.getOrgSettings();
    res.json(settings || {});
  });
  router.patch("/api/admin/org-settings", async (req, res) => {
    const settings = await storage.updateOrgSettings(req.body);
    res.json(settings);
  });

  router.get("/api/admin/users", async (_req, res) => {
    const users = await storage.getAdminUsers();
    res.json(users);
  });
  router.post("/api/admin/users", async (req, res) => {
    const user = await storage.createAdminUser(req.body);
    res.json(user);
  });
  router.patch("/api/admin/users/:id", async (req, res) => {
    const updated = await storage.updateAdminUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json(updated);
  });
router.delete("/api/admin/users/:id", async (req, res) => {
    const deleted = await storage.deleteAdminUser(req.params.id);
    if (!deleted) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  });

  router.get("/api/admin/environments", async (_req, res) => {
    const configs = await storage.getEnvironmentConfigs();
    res.json(configs);
  });
  router.patch("/api/admin/environments/:id", async (req, res) => {
    const updated = await storage.updateEnvironmentConfig(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Environment not found" });
    res.json(updated);
  });

  router.get("/api/admin/secret-rotation", async (_req, res) => {
    const policies = await storage.getSecretRotationPolicies();
    res.json(policies);
  });
  router.post("/api/admin/secret-rotation", async (req, res) => {
    const policy = await storage.createSecretRotationPolicy(req.body);
    res.json(policy);
  });
  router.patch("/api/admin/secret-rotation/:id", async (req, res) => {
    const updated = await storage.updateSecretRotationPolicy(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Policy not found" });
    res.json(updated);
  });
router.delete("/api/admin/secret-rotation/:id", async (req, res) => {
    const deleted = await storage.deleteSecretRotationPolicy(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Policy not found" });
    res.json({ success: true });
  });

  router.get("/api/admin/webhooks", async (_req, res) => {
    const webhooks = await storage.getAdminWebhooks();
    res.json(webhooks);
  });
  router.post("/api/admin/webhooks", async (req, res) => {
    const webhook = await storage.createAdminWebhook(req.body);
    res.json(webhook);
  });
  router.patch("/api/admin/webhooks/:id", async (req, res) => {
    const updated = await storage.updateAdminWebhook(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Webhook not found" });
    res.json(updated);
  });
router.delete("/api/admin/webhooks/:id", async (req, res) => {
    const deleted = await storage.deleteAdminWebhook(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Webhook not found" });
    res.json({ success: true });
  });
  router.post("/api/admin/webhooks/:id/test", async (req, res) => {
    const webhook = await storage.getAdminWebhook(req.params.id);
    if (!webhook) return res.status(404).json({ error: "Webhook not found" });

    const startTime = Date.now();
    let success = false;
    let message = "";

    try {
      const webhookUrl = (webhook as any).url || (webhook as any).endpoint;
      if (!webhookUrl) {
        message = "No webhook URL configured";
      } else {
        const testPayload = {
          event: "webhook.test",
          timestamp: new Date().toISOString(),
          source: "nous-orchestrator",
          webhookId: webhook.id,
        };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": "NousOrchestrator/1.0 WebhookTest" },
            body: JSON.stringify(testPayload),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          success = response.ok;
          message = success
            ? `Webhook delivered successfully (HTTP ${response.status})`
            : `Webhook endpoint returned error (HTTP ${response.status})`;
        } catch (fetchErr: any) {
          clearTimeout(timeout);
          if (fetchErr.name === "AbortError") {
            message = "Webhook delivery timed out after 10 seconds";
          } else {
            message = `Webhook delivery failed: ${fetchErr.message}`;
          }
        }
      }
    } catch (err: any) {
      message = `Test error: ${err.message}`;
    }

    const latencyMs = Date.now() - startTime;
    await storage.updateAdminWebhook(req.params.id, {
      lastDeliveryAt: new Date(),
      lastDeliveryStatus: success ? "success" : "failed",
      deliveredCount: (webhook.deliveredCount ?? 0) + (success ? 1 : 0),
      failedCount: (webhook.failedCount ?? 0) + (success ? 0 : 1),
    });
    res.json({ success, latencyMs, message });
  });

  // ─── Job Queue Routes ───

  router.post("/api/jobs/eval_baseline", async (req, res) => {
    try {
      const schema = z.object({
        agentId: z.string(),
        suiteId: z.string(),
        blueprintId: z.string().optional(),
      });
      const { agentId, suiteId, blueprintId } = schema.parse(req.body);

      const agent = await storage.getAgent(agentId);
      if (!agent) return res.status(404).json({ error: "Agent not found" });

      const suite = await storage.getEvalSuite(suiteId);
      if (!suite) return res.status(404).json({ error: "Eval suite not found" });

      const job = await storage.createJob({
        type: "eval_baseline",
        status: "queued",
        agentId,
        payload: { agentId, suiteId, blueprintId: blueprintId || null },
        progress: 0,
      });

      await storage.createAuditEvent({
        actorType: "system",
        actorId: agent.owner || "system",
        action: "eval_baseline_enqueued",
        objectType: "agent",
        objectId: agentId,
        details: `Baseline eval job ${job.id} enqueued for agent "${agent.name}" (suite: ${suite.name})`,
      });

      res.status(201).json(job);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  router.get("/api/jobs/:id", async (req, res) => {
    const job = await storage.getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  router.get("/api/jobs/agent/:agentId", async (req, res) => {
    const jobs = await storage.getJobsByAgent(req.params.agentId);
    res.json(jobs);
  });

  // ─── Server-Sent Events for real-time job notifications ───

  router.get("/api/events/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");

    const agentId = req.query.agentId as string | undefined;

    const onProgress = (data: { jobId: string; agentId: string; progress: number; step: string }) => {
      if (agentId && data.agentId !== agentId) return;
      res.write(`data: ${JSON.stringify({ type: "progress", ...data })}\n\n`);
    };

    const onCompleted = (data: { jobId: string; agentId: string; result: unknown }) => {
      if (agentId && data.agentId !== agentId) return;
      res.write(`data: ${JSON.stringify({ type: "completed", jobId: data.jobId, agentId: data.agentId, result: data.result })}\n\n`);
    };

    const onFailed = (data: { jobId: string; agentId: string; error: string }) => {
      if (agentId && data.agentId !== agentId) return;
      res.write(`data: ${JSON.stringify({ type: "failed", jobId: data.jobId, agentId: data.agentId, error: data.error })}\n\n`);
    };

    jobEvents.on("progress", onProgress);
    jobEvents.on("completed", onCompleted);
    jobEvents.on("failed", onFailed);

    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      jobEvents.off("progress", onProgress);
      jobEvents.off("completed", onCompleted);
      jobEvents.off("failed", onFailed);
    });
  });

  // ──────────────────────────────────

export default router;
