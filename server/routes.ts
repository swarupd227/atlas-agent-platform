import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ZodError } from "zod";
import OpenAI from "openai";
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
} from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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

  app.post("/api/outcomes", async (req, res) => {
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

  app.post("/api/agents", async (req, res) => {
    try {
      const data = insertAgentSchema.parse(req.body);
      const agent = await storage.createAgent(data);
      res.status(201).json(agent);
    } catch (e) {
      handleZodError(res, e);
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

  app.post("/api/deployments", async (req, res) => {
    try {
      const data = insertDeploymentSchema.parse(req.body);
      const deployment = await storage.createDeployment(data);
      res.status(201).json(deployment);
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

      res.status(201).json(promoted);
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
      res.json(updated);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/evals", async (_req, res) => {
    const suites = await storage.getEvalSuites();
    res.json(suites);
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

  app.post("/api/policies", async (req, res) => {
    try {
      const data = insertPolicySchema.parse(req.body);
      const policy = await storage.createPolicy(data);
      res.status(201).json(policy);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.get("/api/approvals", async (_req, res) => {
    const approvals = await storage.getApprovals();
    res.json(approvals);
  });

  app.post("/api/approvals", async (req, res) => {
    try {
      const data = insertApprovalSchema.parse(req.body);
      const approval = await storage.createApproval(data);
      res.status(201).json(approval);
    } catch (e) {
      handleZodError(res, e);
    }
  });

  app.patch("/api/approvals/:id", async (req, res) => {
    const updated = await storage.updateApproval(req.params.id, {
      ...req.body,
      decidedAt: new Date(),
    });
    if (!updated) return res.status(404).json({ message: "Not found" });
    res.json(updated);
  });

  app.get("/api/audit-events", async (_req, res) => {
    const events = await storage.getAuditEvents();
    res.json(events);
  });

  app.get("/api/invoices", async (_req, res) => {
    const invoices = await storage.getInvoices();
    res.json(invoices);
  });

  app.post("/api/invoices", async (req, res) => {
    try {
      const data = insertInvoiceSchema.parse(req.body);
      const invoice = await storage.createInvoice(data);
      res.status(201).json(invoice);
    } catch (e) {
      handleZodError(res, e);
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

Return a JSON array of template recommendations, ranked by relevance. For each, include:
- id: the template id
- matchScore: percentage match (0-100)
- reasoning: 1-2 sentences explaining WHY this template is a good fit based on the user's specific requirements

Respond ONLY with a valid JSON array, no markdown, no explanation outside the JSON. Example format:
[{"id": "abc", "matchScore": 92, "reasoning": "This template's ticket classification and KB search align with your support-focused agent description."}]

Always include ALL templates, ranked from best to worst match.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 1024,
        temperature: 0.3,
      });

      const content = completion.choices[0]?.message?.content || "[]";
      try {
        const matches = JSON.parse(content);
        res.json({ matches });
      } catch {
        res.json({ matches: [] });
      }
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

  return httpServer;
}
